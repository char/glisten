import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
  lineStart,
  literal,
  lookahead,
  matchRun,
  notNext,
  on,
  oneOf,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  saveRun,
  setState,
  slot,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const letter = union(range("a", "z"), range("A", "Z"), "_");
const name = union(letter, range("0", "9"), ".-/");
const horizontal = " \t";
const prefix = slot.run("recipePrefix");
const functions =
  "abspath addprefix addsuffix and basename call dir error eval file filter filter-out findstring firstword flavor foreach guile if info join lastword let notdir or origin patsubst realpath shell sort strip subst suffix value warning wildcard word wordlist words".split(
    " ",
  );
const modifiers = ["override", "export", "unexport", "private"];
const directives = [
  "ifeq",
  "ifneq",
  "ifdef",
  "ifndef",
  "else",
  "endif",
  "include",
  "-include",
  "sinclude",
  "undefine",
  "vpath",
];
const operators = choice(...["::=", ":=", "?=", "+=", "!=", "="].map((s) => [literal(s)]));
const continueLine = on(
  "\\",
  literal("\\"),
  optional(literal("\r")),
  literal("\n"),
  paint("string.escape"),
);
const escapedHash = token("\\#", "string.escape");

function expansions(injected: boolean): Record<string, State> {
  const gap = injected ? [hostPrefix()] : [];
  const s = injected ? "Shell" : "Make";
  const open = (delimiter: "(" | "{") =>
    on(
      "$",
      literal("$" + delimiter),
      ...gap,
      paint("punctuation.special"),
      pushState(`exp${s}${delimiter === "(" ? "Round" : "Brace"}Start`),
    );
  const inner = [
    open("("),
    open("{"),
    on("$", literal("$"), byte(except(all, "({$\r\n")), ...gap, paint("variable")),
  ];
  const result: Record<string, State> = {};
  for (const [key, close, nest] of [
    ["Round", ")", "("],
    ["Brace", "}", "{"],
  ] as const) {
    const base = `exp${s}${key}`;
    result[`${base}Start`] = {
      style: "variable",
      arms: [
        on(close, literal(close), ...gap, paint("punctuation.special"), popState()),
        ...inner,
        on(
          letter,
          byte(letter),
          bytes(union(letter, range("0", "9"), "-"), { min: 0 }),
          lookahead(byte(" \t\r\n")),
          classify(
            functions.map((text) => ({
              text,
              then: [...gap, paint("function"), setState(base)],
            })),
            [...gap, paint("variable"), setState(base)],
          ),
        ),
        on(
          letter,
          byte(letter),
          bytes(union(letter, range("0", "9"), "-"), { min: 0 }),
          ...gap,
          paint("variable"),
          setState(base),
        ),
        on(all, character(), ...gap, paint("variable"), setState(base)),
      ],
    };
    result[base] = {
      style: "variable",
      arms: [
        on(close, literal(close), ...gap, paint("punctuation.special"), popState()),
        on(nest, literal(nest), ...gap, paint("punctuation.special"), pushState(base)),
        ...inner,
        on(all, character(), ...gap, paint("variable")),
      ],
    };
  }
  return result;
}
function variables(injected: boolean) {
  const gap = injected ? [hostPrefix()] : [];
  const s = injected ? "Shell" : "Make";
  return [
    ...(injected ? [token("$$", "plain")] : [token("$$", "string.escape")]),
    on("$", literal("$("), ...gap, paint("punctuation.special"), pushState(`exp${s}RoundStart`)),
    on("$", literal("${"), ...gap, paint("punctuation.special"), pushState(`exp${s}BraceStart`)),
    on("$", literal("$"), byte(except(all, "({$\r\n")), ...gap, paint("variable")),
  ];
}
function mode(custom: boolean): Record<string, State> {
  const suffix = custom ? "Custom" : "Tab";
  const line = `line${suffix}`;
  const pending = `pending${suffix}`;
  const rule = `rule${suffix}`;
  const recipeStart = `recipeStart${suffix}`;
  const recipe = `recipe${suffix}`;
  const continued = `continued${suffix}`;
  const definition = `definition${suffix}`;
  const head = `head${suffix}`;
  const lineArms = (canRecipe: boolean) => [
    ...(canRecipe
      ? [
          custom
            ? on(
                all,
                lineStart(),
                matchRun(prefix, { relation: "prefix" }),
                paint("punctuation.special"),
                openInjection({ static: "bash" }),
                setState(recipeStart),
              )
            : on(
                "\t",
                lineStart(),
                literal("\t"),
                paint("punctuation.special"),
                openInjection({ static: "bash" }),
                setState(recipeStart),
              ),
        ]
      : []),
    on(" \t", bytes(" \t"), paint("plain")),
    token("\n", "plain"),
    token("#", "comment", pushState("comment")),
    on(
      ".",
      literal(".RECIPEPREFIX"),
      notNext(name),
      lookahead(bytes(horizontal, { min: 0 }), operators),
      paint("variable"),
      setState(`prefixAssign${suffix}`),
    ),
    on(
      name,
      bytes(name),
      lookahead(bytes(horizontal, { min: 0 }), operators),
      paint("variable"),
      setState(`assignment${suffix}`),
    ),
    on(
      union(letter, "-"),
      bytes(union(letter, "-")),
      notNext(name),
      classify(
        [
          { text: "define", then: [paint("keyword"), setState(`defineName${suffix}`)] },
          ...modifiers.map((text) => ({ text, then: [paint("keyword")] })),
          ...directives.map((text) => ({
            text,
            then: [paint("keyword"), setState(`directive${canRecipe ? "Pending" : ""}${suffix}`)],
          })),
        ],
        [paint("label"), setState(head)],
      ),
    ),
    redispatch(all, setState(head)),
  ];
  return {
    [line]: { style: "plain", arms: lineArms(false) },
    [pending]: { style: "plain", arms: lineArms(true) },
    [head]: {
      style: "label",
      arms: [
        on(" \t", bytes(horizontal), paint("plain")),
        token("%", "punctuation.special"),
        ...variables(false),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        token("::", "punctuation.delimiter", setState(rule)),
        token(":", "punctuation.delimiter", setState(rule)),
        token("\n", "plain", setState(line)),
      ],
    },
    [rule]: {
      style: "plain",
      arms: [
        ...variables(false),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        on(
          name,
          bytes(name),
          lookahead(bytes(horizontal, { min: 0 }), operators),
          paint("variable"),
          setState(`assignment${suffix}`),
        ),
        on(
          letter,
          bytes(letter),
          lookahead(bytes(horizontal), bytes(name), bytes(horizontal, { min: 0 }), operators),
          classify(
            modifiers.map((text) => ({ text, then: [paint("keyword")] })),
            [paint("plain")],
          ),
        ),
        token(
          ";",
          "punctuation.delimiter",
          openInjection({ static: "bash" }),
          setState(recipeStart),
        ),
        token(oneOf(":|"), "punctuation.delimiter"),
        token("%", "punctuation.special"),
        token("\n", "plain", setState(pending)),
      ],
    },
    [`assignment${suffix}`]: {
      style: "plain",
      arms: [
        ...variables(false),
        escapedHash,
        continueLine,
        on("=:+?!", operators, paint("operator")),
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(line)),
      ],
    },
    [`directive${suffix}`]: {
      style: "plain",
      arms: [
        ...variables(false),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(line)),
      ],
    },
    [`directivePending${suffix}`]: {
      style: "plain",
      arms: [
        ...variables(false),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(pending)),
      ],
    },
    [`defineName${suffix}`]: {
      style: "plain",
      arms: [
        ...variables(false),
        on(name, bytes(name), paint("variable")),
        on("=:+?!", operators, paint("operator")),
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(definition)),
      ],
    },
    [definition]: {
      style: "plain",
      arms: [
        on(
          " \te",
          lineStart(),
          bytes(horizontal, { min: 0 }),
          literal("endef"),
          notNext(name),
          paint("keyword"),
          setState(`directive${suffix}`),
        ),
        on(
          " \td",
          lineStart(),
          bytes(horizontal, { min: 0 }),
          literal("define"),
          notNext(name),
          paint("keyword"),
          pushState(`nestedDefineName${suffix}`),
        ),
        ...variables(false),
      ],
    },
    [`nestedDefineName${suffix}`]: {
      style: "plain",
      arms: [
        ...variables(false),
        on(name, bytes(name), paint("variable")),
        on("=:+?!", operators, paint("operator")),
        token("\n", "plain", setState(`nestedDefinition${suffix}`)),
      ],
    },
    [`nestedDefinition${suffix}`]: {
      style: "plain",
      arms: [
        on(
          " \te",
          lineStart(),
          bytes(horizontal, { min: 0 }),
          literal("endef"),
          notNext(name),
          paint("keyword"),
          popState(),
        ),
        on(
          " \td",
          lineStart(),
          bytes(horizontal, { min: 0 }),
          literal("define"),
          notNext(name),
          paint("keyword"),
          pushState(`nestedDefineName${suffix}`),
        ),
        ...variables(false),
      ],
    },
    [`prefixAssign${suffix}`]: {
      style: "plain",
      arms: [
        on(" \t", bytes(horizontal), paint("plain")),
        on("=:+?!", operators, paint("operator"), setState(`prefixValue${suffix}`)),
        redispatch(all, setState(`assignment${suffix}`)),
      ],
    },
    [`prefixValue${suffix}`]: {
      style: "plain",
      arms: [
        on(" \t", bytes(horizontal), paint("plain")),
        token("\r\n", "plain", setState("lineTab")),
        token("\n", "plain", setState("lineTab")),
        token("#", "comment", setState("assignmentTab"), pushState("comment")),
        on(
          except(range("!", "~"), "#$\\"),
          byte(except(range("!", "~"), "#$\\")),
          saveRun(prefix),
          paint("string"),
          setState(`assignmentCustom`),
        ),
      ],
      otherwise: [setState(`assignment${suffix}`)],
    },
    [recipeStart]: {
      style: "plain",
      arms: [
        on(" \t@-+", bytes(" \t@-+"), hostPrefix(), paint("punctuation.special")),
        redispatch(all, setState(recipe)),
      ],
    },
    [recipe]: {
      style: "plain",
      arms: [
        ...variables(true),
        on(
          "\\",
          literal("\\"),
          optional(literal("\r")),
          literal("\n"),
          paint("plain"),
          setState(continued),
        ),
        on("\n", literal("\n"), closeInjection(), paint("plain"), setState(pending)),
      ],
    },
    [continued]: {
      style: "plain",
      arms: [
        ...(custom
          ? [
              on(
                all,
                lineStart(),
                matchRun(prefix, { relation: "prefix" }),
                hostPrefix(),
                paint("punctuation.special"),
                setState(recipe),
              ),
            ]
          : [
              on(
                "\t",
                lineStart(),
                literal("\t"),
                hostPrefix(),
                paint("punctuation.special"),
                setState(recipe),
              ),
            ]),
        redispatch(all, setState(recipe)),
      ],
    },
  };
}

// Only literal .RECIPEPREFIX assignments are tracked; computed values, conditional
// execution and .ONESHELL are not evaluated. Recipes are always injected as Bash.
// Make expansions are parent spans omitted from the joined Bash document; $$ is
// passed to Bash unchanged rather than rewritten to the dollar produced by make.
const states: Record<string, State> = {
  ...mode(false),
  ...mode(true),
  ...expansions(false),
  ...expansions(true),
  comment: { style: "comment", arms: [redispatch("\n", popState())] },
};
export default defineGrammar({
  name: "make",
  aliases: ["makefile", "mk", "gnumake"],
  initial: "lineTab",
  states,
});
