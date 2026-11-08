import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  repeat,
  setState,
  token,
  union,
  type State,
  type Arm,
  type Effect,
} from "#/grammar/mod.ts";

type Dialect = "jinja" | "twig";

type Extension = {
  rawWord: string;
  rawEnd: string;
  openTrim: string;
  rawOpenTrim: string;
  filterStatement: string;
  closeTrim: string;
  isStyle: "keyword" | "operator";
  constants: readonly string[];
  operators: readonly string[];
  keywords: string;
  number: Arm;
  comments: readonly Arm[];
  codeOperators: readonly Arm[];
  symbols: readonly Arm[];
  functionEffect(cases: ReturnType<typeof keywordTable>): Effect;
  aliases?: readonly string[];
  expressionClose: readonly Arm[];
  statementHead: readonly Arm[];
  rawHeaderClose: readonly Arm[];
  interpolation: readonly Arm[];
  testNames: readonly Arm[];
  states(code: readonly Arm[]): Record<string, State>;
};

const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const space = " \t\r\n\v\f";

function jinjaExtension(): Extension {
  return {
    rawWord: "raw",
    rawEnd: "endraw",
    openTrim: "-+",
    rawOpenTrim: "-",
    filterStatement: "filter",
    closeTrim: "+",
    isStyle: "keyword" as const,
    constants: ["true", "false", "none", "True", "False", "None"],
    operators: [],
    keywords: `if elif else endif for in recursive endfor block endblock extends include import as from
      macro endmacro call endcall set endset filter endfilter with endwith raw endraw trans
      endtrans pluralize not and or is none true false True False None scoped required ignore
      missing without context autoescape endautoescape do break continue`,

    number: on(
      digit,
      choice(
        [literal("0"), byte("xX"), bytes(union(hex, "_"))],
        [literal("0"), byte("bB"), bytes("01_")],
        [literal("0"), byte("oO"), bytes("01234567_")],
        [
          bytes(union(digit, "_")),
          optional(literal("."), bytes(union(digit, "_"))),
          optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
        ],
      ),
      paint("number"),
    ),
    comments: [],
    codeOperators: [],
    symbols: [],
    functionEffect(cases) {
      return classify(cases, [paint("function")]);
    },
    aliases: ["jinja2"],
    expressionClose: [],
    statementHead: [],
    rawHeaderClose: [],
    interpolation: [],
    testNames: [],
    states: () => ({}),
  };
}

function twigExtension(): Extension {
  const twigOperators = [
    ...[
      ["starts", "with"],
      ["ends", "with"],
      ["not", "in"],
      ["has", "some"],
      ["has", "every"],
    ].map(([first, second]) =>
      on(
        first![0]!,
        literal(first!),
        bytes(space),
        literal(second!),
        notNext(rest),
        paint("operator"),
      ),
    ),
    ...["b-and", "b-or", "b-xor"].map((word) =>
      on("b", literal(word), notNext(rest), paint("operator")),
    ),
  ];
  const twigSymbolOperators = ["...", "..", "<=>", "??", "?:", "=>", "?"].map((operator) =>
    token(operator, "operator"),
  );
  return {
    rawWord: "verbatim",
    rawEnd: "endverbatim",
    openTrim: "-~",
    rawOpenTrim: "-~",
    filterStatement: "apply",
    closeTrim: "~",
    isStyle: "operator" as const,
    constants: ["true", "false", "null", "none", "TRUE", "FALSE", "NULL", "NONE"],
    operators: ["and", "or", "xor", "not", "in", "matches"],
    keywords: `if elseif else endif for in endfor block endblock extends include embed endembed use
      macro endmacro import from as set endset apply endapply verbatim endverbatim with endwith
      deprecated guard sandbox endsandbox cache endcache do flush autoescape endautoescape
      not and or is starts ends matches same true false null`,

    number: on(
      digit,
      bytes(digit),
      repeat(literal("_"), bytes(digit)),
      optional(literal("."), bytes(digit), repeat(literal("_"), bytes(digit))),
      optional(byte("eE"), optional(byte("+-")), bytes(digit), repeat(literal("_"), bytes(digit))),
      paint("number"),
    ),
    comments: [token("#", "comment", pushState("twigLineComment"))],
    codeOperators: twigOperators,
    symbols: twigSymbolOperators,
    functionEffect: () => paint("function"),
    expressionClose: [token("~}}", "punctuation.special", popState())],
    statementHead: [on(first, ...name, paint("keyword"), setState("statement"))],
    rawHeaderClose: [token("~%}", "punctuation.special", setState("raw"))],
    interpolation: [token("#{", "punctuation.special", pushState("twigInterpolation"))],
    testNames: [
      on(
        "s",
        literal("same"),
        lookahead(bytes(space), literal("as"), notNext(rest)),
        paint("function"),
        setState("twigSameAs"),
      ),
    ],
    states(code): Record<string, State> {
      return {
        twigSameAs: {
          style: "plain",
          arms: [on(space, bytes(space), paint("plain")), token("as", "keyword", popState())],
          otherwise: [popState()],
        },
        twigLineComment: {
          style: "comment",
          arms: [on("\n", literal("\n"), paint("plain"), popState())],
        },
        twigInterpolation: {
          style: "plain",
          arms: [token("}", "punctuation.special", popState()), ...code],
        },
      };
    },
  };
}

export function template(dialect: Dialect) {
  const extension = { jinja: jinjaExtension, twig: twigExtension }[dialect]();
  const words = keywordTable(extension.keywords.trim().split(/\s+/), "keyword");
  const constants = extension.constants;
  const wordOperators: readonly string[] = extension.operators;
  const cases = [
    ...keywordTable(constants, "constant.builtin"),
    ...keywordTable(wordOperators, "operator"),
    ...words.filter(
      (entry) => !constants.includes(entry.text) && !wordOperators.includes(entry.text),
    ),
  ];
  const code = [
    token('"', "string", pushState("doubleString")),
    token("'", "string", pushState("singleString")),
    ...extension.comments,
    extension.number,
    ...extension.codeOperators,
    on(
      first,
      ...name,
      lookahead(bytes(space, { min: 0 }), literal("(")),
      extension.functionEffect(cases),
    ),
    on(
      first,
      ...name,
      classify(
        [
          { text: "is", then: [paint(extension.isStyle), pushState("testName")] },
          ...cases.filter((entry) => entry.text !== "is"),
        ],
        [paint("variable")],
      ),
    ),
    token("|", "operator", pushState("filterName")),
    ...extension.symbols,
    token(".", "punctuation.delimiter", pushState("member")),
    token("(", "punctuation.bracket", pushState("paren")),
    token("[", "punctuation.bracket", pushState("square")),
    token("{", "punctuation.bracket", pushState("curly")),
    ...["==", "!=", "<=", ">=", "//", "**"].map((s) => token(s, "operator")),
    token(oneOf("+-*/%=<>~"), "operator"),
    token(oneOf(",:"), "punctuation.delimiter"),
  ];
  const { rawWord, rawEnd, openTrim } = extension;
  const rawOpening = on(
    "{",
    literal("{%"),
    optional(byte(openTrim)),
    lookahead(
      bytes(space, { min: 0 }),
      literal(rawWord),
      notNext(rest),
      bytes(space, { min: 0 }),
      optional(byte(extension.rawOpenTrim)),
      literal("%}"),
    ),
    paint("punctuation.special"),
    pushState("rawHeader"),
  );
  const rawClosing = on(
    "{",
    literal("{%"),
    optional(byte(openTrim)),
    lookahead(
      bytes(space, { min: 0 }),
      literal(rawEnd),
      notNext(rest),
      bytes(space, { min: 0 }),
      optional(byte(openTrim)),
      literal("%}"),
    ),
    paint("punctuation.special"),
    setState("rawFooter"),
  );
  const tagOpen = (text: string, style: "punctuation.special" | "comment", state: string) =>
    on("{", literal(text), optional(byte(openTrim)), paint(style), pushState(state));

  // Template data is plain, not an HTML injection; line statements/comments are
  // environment opt-ins. Keyword spellings are styled in all tag contexts, even
  // when used as names. Non-ASCII identifier bytes are accepted without Unicode
  // identifier validation; numeric separators are colored without validation.
  return defineGrammar<string>({
    name: dialect,
    ...(extension.aliases ? { aliases: extension.aliases } : {}),
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          rawOpening,
          tagOpen("{{", "punctuation.special", "expression"),
          tagOpen("{%", "punctuation.special", "statementStart"),
          tagOpen("{#", "comment", "comment"),
        ],
      },
      expression: {
        style: "plain",
        arms: [
          token("-}}", "punctuation.special", popState()),
          ...extension.expressionClose,
          token("}}", "punctuation.special", popState()),
          ...code,
        ],
      },
      statementStart: {
        style: "plain",
        arms: [
          on(space, bytes(space), paint("plain")),
          on(
            extension.filterStatement[0]!,
            literal(extension.filterStatement),
            notNext(rest),
            paint("keyword"),
            setState("statement"),
            pushState("filterName"),
          ),
          ...extension.statementHead,
        ],
        otherwise: [setState("statement")],
      },
      statement: {
        style: "plain",
        arms: [
          token("-%}", "punctuation.special", popState()),
          token(extension.closeTrim + "%}", "punctuation.special", popState()),
          token("%}", "punctuation.special", popState()),
          ...code,
        ],
      },
      comment: {
        style: "comment",
        arms: [
          token("-#}", "comment", popState()),
          token(extension.closeTrim + "#}", "comment", popState()),
          token("#}", "comment", popState()),
        ],
      },
      rawHeader: {
        style: "plain",
        arms: [
          token(rawWord, "keyword"),
          token("-%}", "punctuation.special", setState("raw")),
          ...extension.rawHeaderClose,
          token("%}", "punctuation.special", setState("raw")),
        ],
      },
      raw: { style: "plain", arms: [rawClosing] },
      rawFooter: {
        style: "plain",
        arms: [
          token(rawEnd, "keyword"),
          token("-%}", "punctuation.special", popState()),
          token(extension.closeTrim + "%}", "punctuation.special", popState()),
          token("%}", "punctuation.special", popState()),
        ],
      },
      paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...code] },
      square: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...code] },
      curly: { style: "plain", arms: [token("}", "punctuation.bracket", popState()), ...code] },
      doubleString: {
        style: "string",
        arms: [escape, ...extension.interpolation, token('"', "string", popState())],
      },
      ...extension.states(code),
      singleString: { style: "string", arms: [escape, token("'", "string", popState())] },
      filterName: {
        style: "plain",
        arms: [
          on(space, bytes(space), paint("plain")),
          on(first, ...name, repeat(literal("."), ...name), paint("function"), popState()),
        ],
        otherwise: [popState()],
      },
      testName: {
        style: "plain",
        arms: [
          on(space, bytes(space), paint("plain")),
          ...extension.testNames,
          on(
            first,
            ...name,
            classify([{ text: "not", then: [paint("keyword")] }], [paint("function"), popState()]),
          ),
        ],
        otherwise: [popState()],
      },
      member: {
        style: "plain",
        arms: [
          on(
            first,
            ...name,
            lookahead(bytes(space, { min: 0 }), literal("(")),
            paint("function"),
            popState(),
          ),
          on(first, ...name, paint("variable.member"), popState()),
        ],
        otherwise: [popState()],
      },
    },
  });
}
