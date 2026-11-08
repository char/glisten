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
const functions = `
  abspath addprefix addsuffix and basename call dir error eval file filter filter-out findstring
  firstword flavor foreach guile if info join lastword let notdir or origin patsubst realpath
  shell sort strip subst suffix value warning wildcard word wordlist words
`
  .trim()
  .split(/\s+/);
const modifiers = ["override", "export", "unexport", "private"];
const directives = `
  ifeq ifneq ifdef ifndef else endif include -include sinclude undefine vpath
`
  .trim()
  .split(/\s+/);
const operators = choice(
  ...["::=", ":=", "?=", "+=", "!=", "="].map((operator) => [literal(operator)]),
);
const continueLine = on(
  "\\",
  literal("\\"),
  optional(literal("\r")),
  literal("\n"),
  paint("string.escape"),
);
const escapedHash = token("\\#", "string.escape");

type ExpansionContext = "shell" | "make";
type RecipePrefix = "custom" | "tab";

function expansions(context: ExpansionContext): Record<string, State> {
  const gap = context === "shell" ? [hostPrefix()] : [];
  const suffix = context === "shell" ? "Shell" : "Make";
  const open = (delimiter: "(" | "{") =>
    on(
      "$",
      literal("$" + delimiter),
      ...gap,
      paint("punctuation.special"),
      pushState(`exp${suffix}${delimiter === "(" ? "Round" : "Brace"}Start`),
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
    const base = `exp${suffix}${key}`;
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
function variables(context: ExpansionContext) {
  const gap = context === "shell" ? [hostPrefix()] : [];
  const suffix = context === "shell" ? "Shell" : "Make";
  return [
    token("$$", context === "shell" ? "plain" : "string.escape"),
    on(
      "$",
      literal("$("),
      ...gap,
      paint("punctuation.special"),
      pushState(`exp${suffix}RoundStart`),
    ),
    on(
      "$",
      literal("${"),
      ...gap,
      paint("punctuation.special"),
      pushState(`exp${suffix}BraceStart`),
    ),
    on("$", literal("$"), byte(except(all, "({$\r\n")), ...gap, paint("variable")),
  ];
}
function mode(prefixMode: RecipePrefix): Record<string, State> {
  const suffix = prefixMode === "custom" ? "Custom" : "Tab";
  const line = `line${suffix}`;
  const pending = `pending${suffix}`;
  const rule = `rule${suffix}`;
  const recipeStart = `recipeStart${suffix}`;
  const recipe = `recipe${suffix}`;
  const continued = `continued${suffix}`;
  const definition = `definition${suffix}`;
  const head = `head${suffix}`;
  const lineArms = (context: "pending" | "ordinary") => [
    ...(context === "pending"
      ? [
          prefixMode === "custom"
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
            then: [
              paint("keyword"),
              setState(`directive${context === "pending" ? "Pending" : ""}${suffix}`),
            ],
          })),
        ],
        [paint("label"), setState(head)],
      ),
    ),
    redispatch(all, setState(head)),
  ];
  return {
    [line]: { style: "plain", arms: lineArms("ordinary") },
    [pending]: { style: "plain", arms: lineArms("pending") },
    [head]: {
      style: "label",
      arms: [
        on(" \t", bytes(horizontal), paint("plain")),
        token("%", "punctuation.special"),
        ...variables("make"),
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
        ...variables("make"),
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
        ...variables("make"),
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
        ...variables("make"),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(line)),
      ],
    },
    [`directivePending${suffix}`]: {
      style: "plain",
      arms: [
        ...variables("make"),
        escapedHash,
        continueLine,
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState(pending)),
      ],
    },
    [`defineName${suffix}`]: {
      style: "plain",
      arms: [
        ...variables("make"),
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
        ...variables("make"),
      ],
    },
    [`nestedDefineName${suffix}`]: {
      style: "plain",
      arms: [
        ...variables("make"),
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
        ...variables("make"),
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
        ...variables("shell"),
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
        ...(prefixMode === "custom"
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
  ...mode("tab"),
  ...mode("custom"),
  ...expansions("make"),
  ...expansions("shell"),
  comment: { style: "comment", arms: [redispatch("\n", popState())] },
};
export default defineGrammar({
  name: "make",
  extensions: ["mk", "mak"],
  filenames: ["Makefile", "makefile", "GNUmakefile", "BSDmakefile"],
  aliases: ["makefile", "mk", "gnumake"],
  initial: "lineTab",
  states,
});
