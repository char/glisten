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
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const space = " \t\r\n\v\f";
const words = [
  ...keywordTable(
    "if elif else endif for in recursive endfor block endblock extends include import as from macro endmacro call endcall set endset filter endfilter with endwith raw endraw trans endtrans pluralize not and or is none true false True False None scoped required ignore missing without context autoescape endautoescape do break continue".split(
      " ",
    ),
    "keyword",
  ),
];
const constants = ["true", "false", "none", "True", "False", "None"];
const cases = [
  ...keywordTable(constants, "constant.builtin"),
  ...words.filter((entry) => !constants.includes(entry.text)),
];
const number = on(
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
);
const code = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
  number,
  on(
    first,
    ...name,
    lookahead(bytes(space, { min: 0 }), literal("(")),
    classify(cases, [paint("function")]),
  ),
  on(
    first,
    ...name,
    classify(
      [
        { text: "is", then: [paint("keyword"), pushState("testName")] },
        ...cases.filter((entry) => entry.text !== "is"),
      ],
      [paint("variable")],
    ),
  ),
  token("|", "operator", pushState("filterName")),
  token(".", "punctuation.delimiter", pushState("member")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("square")),
  token("{", "punctuation.bracket", pushState("curly")),
  ...["==", "!=", "<=", ">=", "//", "**"].map((s) => token(s, "operator")),
  token(oneOf("+-*/%=<>~"), "operator"),
  token(oneOf(",:"), "punctuation.delimiter"),
];
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const rawOpening = on(
  "{",
  literal("{%"),
  optional(byte("-+")),
  lookahead(
    bytes(space, { min: 0 }),
    literal("raw"),
    notNext(rest),
    bytes(space, { min: 0 }),
    optional(byte("-")),
    literal("%}"),
  ),
  paint("punctuation.special"),
  pushState("rawHeader"),
);
const rawClosing = on(
  "{",
  literal("{%"),
  optional(byte("-+")),
  lookahead(
    bytes(space, { min: 0 }),
    literal("endraw"),
    notNext(rest),
    bytes(space, { min: 0 }),
    optional(byte("-+")),
    literal("%}"),
  ),
  paint("punctuation.special"),
  setState("rawFooter"),
);
const tagOpen = (text: string, style: "punctuation.special" | "comment", state: string) =>
  on("{", literal(text), optional(byte("-+")), paint(style), pushState(state));

// Template data is plain, not an HTML injection; line statements/comments are
// environment opt-ins. Keyword spellings are styled in all tag contexts, even
// when used as names. Non-ASCII identifier bytes are accepted without Unicode
// identifier validation; numeric separators are colored without validation.
export default defineGrammar({
  name: "jinja",
  aliases: ["jinja2"],
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
        token("}}", "punctuation.special", popState()),
        ...code,
      ],
    },
    statementStart: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on(
          "f",
          literal("filter"),
          notNext(rest),
          paint("keyword"),
          setState("statement"),
          pushState("filterName"),
        ),
      ],
      otherwise: [setState("statement")],
    },
    statement: {
      style: "plain",
      arms: [
        token("-%}", "punctuation.special", popState()),
        token("+%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
        ...code,
      ],
    },
    comment: {
      style: "comment",
      arms: [
        token("-#}", "comment", popState()),
        token("+#}", "comment", popState()),
        token("#}", "comment", popState()),
      ],
    },
    rawHeader: {
      style: "plain",
      arms: [
        token("raw", "keyword"),
        token("-%}", "punctuation.special", setState("raw")),
        token("%}", "punctuation.special", setState("raw")),
      ],
    },
    raw: { style: "plain", arms: [rawClosing] },
    rawFooter: {
      style: "plain",
      arms: [
        token("endraw", "keyword"),
        token("-%}", "punctuation.special", popState()),
        token("+%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
      ],
    },
    paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...code] },
    square: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...code] },
    curly: { style: "plain", arms: [token("}", "punctuation.bracket", popState()), ...code] },
    doubleString: { style: "string", arms: [escape, token('"', "string", popState())] },
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
