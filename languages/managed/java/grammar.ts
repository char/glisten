import {
  byte,
  byteSet,
  bytes,
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
  redispatch,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_$", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const digits = (set: typeof digit) => [byte(set), repeat(bytes("_", { min: 0 }), byte(set))];
const dec = digits(digit);
const hexd = digits(hex);
const exp = [byte("eE"), optional(byte("+-")), ...dec];
const binexp = [byte("pP"), optional(byte("+-")), ...dec];
const keywords = [
  "abstract",
  "assert",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "interface",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "volatile",
  "while",
  "_",
];
const cases = [
  ...keywordTable(
    keywords.filter((word) => !["class", "interface", "for", "case"].includes(word)),
    "keyword",
  ),
  ...["class", "interface"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("typeName")],
  })),
  { text: "for", then: [paint("keyword"), pushState("forHead")] },
  { text: "case", then: [paint("keyword"), pushState("caseHead")] },
  ...keywordTable(
    ["boolean", "byte", "char", "double", "float", "int", "long", "short", "void"],
    "type",
  ),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [bytes("u"), bytes(hex, { min: 4, max: 4 })],
    [byte("0123"), optional(byte("01234567")), optional(byte("01234567"))],
    [byte("4567"), optional(byte("01234567"))],
    [byte("btnfrs\\\"'")],
  ),
  paint("string.escape"),
);
const code = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  on(
    '"',
    literal('"""'),
    bytes(" \t\f", { min: 0 }),
    choice([literal("\r\n")], [byte("\r\n")]),
    paint("string"),
    pushState("textBlock"),
  ),
  token('"', "string", pushState("string")),
  token("'", "string", pushState("char")),
  on("@", literal("@interface"), notNext(rest), paint("keyword")),
  on("@", literal("@"), ...ident, repeat(literal("."), ...ident), paint("attribute")),
  on(
    ".0123456789",
    choice(
      [
        literal("0"),
        byte("xX"),
        choice([...hexd, optional(literal("."), optional(...hexd))], [literal("."), ...hexd]),
        ...binexp,
        optional(byte("fFdD")),
      ],
      [literal("0"), byte("xX"), ...hexd, optional(byte("lL"))],
      [literal("0"), byte("bB"), ...digits(byteSet({ bytes: [48, 49] })), optional(byte("lL"))],
      [...dec, literal("."), optional(...dec), optional(...exp), optional(byte("fFdD"))],
      [literal("."), ...dec, optional(...exp), optional(byte("fFdD"))],
      [...dec, ...exp, optional(byte("fFdD"))],
      [...dec, byte("fFdD")],
      [...dec, optional(byte("lL"))],
    ),
    paint("number"),
  ),
  on(
    "r",
    literal("record"),
    notNext(rest),
    lookahead(bytes(" \t\r\n"), ...ident, bytes(" \t\r\n", { min: 0 }), literal("(")),
    paint("keyword"),
  ),
  on(
    "s",
    literal("sealed"),
    notNext(rest),
    lookahead(bytes(" \t\r\n"), choice([literal("class")], [literal("interface")]), notNext(rest)),
    paint("keyword"),
  ),
  on(
    "n",
    literal("non-sealed"),
    notNext(rest),
    lookahead(bytes(" \t\r\n"), choice([literal("class")], [literal("interface")]), notNext(rest)),
    paint("keyword"),
  ),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    classify(cases, [paint("function")]),
  ),
  on(range("A", "Z"), ...ident, classify(cases, [paint("type")])),
  on(start, ...ident, classify(cases, [paint("variable")])),
  token("->", "operator"),
  token("::", "operator"),
  token(oneOf("[]"), "punctuation.bracket"),
  token(oneOf(".,;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^~?"), "operator"),
];
const varType = on(
  "v",
  literal("var"),
  notNext(rest),
  lookahead(bytes(" \t\r\n"), ...ident, bytes(" \t\r\n", { min: 0 }), byte("=:")),
  paint("keyword"),
  setState("root"),
);
const yieldStatement = on(
  "y",
  literal("yield"),
  notNext(rest),
  lookahead(bytes(" \t\r\n"), byte(union(start, digit, "\"'(!~+-"))),
  paint("keyword"),
  setState("root"),
);
const braces = (parent: "root" | "paren") => [
  token(
    "{",
    "punctuation.bracket",
    setState(parent === "root" ? "statement" : "paren"),
    pushState("statement"),
  ),
  token("}", "punctuation.bracket", popState()),
  token("(", "punctuation.bracket", pushState("paren")),
];
export default defineGrammar({
  name: "java",
  initial: "statement",
  states: {
    root: {
      style: "plain",
      arms: [
        ...braces("root"),
        token(";", "punctuation.delimiter", setState("statement")),
        on(
          "d",
          literal("default"),
          notNext(rest),
          lookahead(bytes(" \t\r\n", { min: 0 }), literal(":")),
          paint("keyword"),
          pushState("defaultLabel"),
        ),
        ...code,
      ],
    },
    statement: {
      style: "plain",
      arms: [
        on(" \t\r\n\f", bytes(" \t\r\n\f"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        varType,
        yieldStatement,
      ],
      otherwise: [setState("root")],
    },
    paren: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...braces("paren"), ...code],
    },
    forHead: {
      style: "plain",
      arms: [
        on(" \t\r\n\f", bytes(" \t\r\n\f"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        token("(", "punctuation.bracket", setState("forInit")),
      ],
      otherwise: [popState()],
    },
    forInit: {
      style: "plain",
      arms: [
        on(" \t\r\n\f", bytes(" \t\r\n\f"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(
          "v",
          literal("var"),
          notNext(rest),
          lookahead(bytes(" \t\r\n"), ...ident, bytes(" \t\r\n", { min: 0 }), byte("=:")),
          paint("keyword"),
          setState("paren"),
        ),
      ],
      otherwise: [setState("paren")],
    },
    defaultLabel: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token(":", "punctuation.delimiter", popState(), setState("statement")),
      ],
      otherwise: [popState()],
    },
    caseHead: {
      style: "plain",
      arms: [
        token(":", "punctuation.delimiter", popState(), setState("statement")),
        token("->", "operator", popState()),
        token("(", "punctuation.bracket", pushState("paren")),
        ...code,
      ],
    },
    typeName: {
      style: "plain",
      arms: [
        on(" \t\r\n\f", bytes(" \t\r\n\f"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(start, ...ident, paint("type"), setState("typeHeader")),
      ],
      otherwise: [popState()],
    },
    typeHeader: {
      style: "plain",
      arms: [
        redispatch("{;", popState()),
        on(
          "p",
          literal("permits"),
          notNext(rest),
          lookahead(bytes(" \t\r\n"), ...ident),
          paint("keyword"),
        ),
        ...code,
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    char: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\r\n", popState())],
    },
    textBlock: {
      style: "string",
      arms: [
        token("\\\r\n", "string.escape"),
        token("\\\n", "string.escape"),
        token("\\\r", "string.escape"),
        escape,
        token('"""', "string", popState()),
      ],
    },
  },
});
