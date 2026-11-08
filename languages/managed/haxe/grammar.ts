import {
  byte,
  bytes,
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
  redispatch,
  repeat,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper);
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const digits = (set: typeof digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const decimal = digits(digit);
const integer = [
  choice([byte(range("1", "9")), repeat(optional(literal("_")), byte(digit))], [literal("0")]),
];
const intSuffix = [optional(literal("_")), byte("iu"), ...integer, repeat(...integer)];
const floatSuffix = [optional(literal("_")), literal("f"), ...integer, repeat(...integer)];
const exponent = [byte("eE"), optional(byte("+-")), ...decimal];
const keywords = keywordTable(
  `
    package import using class interface enum abstract typedef extends implements public
    private static inline override dynamic extern final macro overload function var if else
    switch case default for in while do break continue return throw try catch untyped cast
    new operator from to as is
  `
    .trim()
    .split(/\s+/),
  "keyword",
);
const declarations = new Set(`class interface enum abstract typedef`.trim().split(/\s+/));
const cases = [
  ...keywords.filter(({ text }) => !declarations.has(text)),
  ...[...declarations].map((text) => ({
    text,
    then: [paint("keyword"), pushState("typeName")],
  })),
  ...keywordTable(`null true false this super`.trim().split(/\s+/), "constant.builtin"),
];
const stringEscape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [byte("0123"), bytes("01234567", { min: 2, max: 2 })],
    [byte("nrt\\\"'$")],
  ),
  paint("string.escape"),
);
const regexEscape = on("\\", literal("\\"), character(), paint("string.escape"));
// Calls and uppercase type names lack name resolution; contextual from/to/as/is are colored everywhere.
const code = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
  token("~/", "string", pushState("regex")),
  on("@", literal("@"), optional(literal(":")), ...ident, paint("attribute")),
  on(
    "#",
    literal("#"),
    choice([literal("elseif")], [literal("else")], [literal("end")], [literal("if")]),
    notNext(rest),
    paint("keyword"),
  ),
  on("$", literal("$"), ...ident, lookahead(literal("{")), paint("punctuation.special")),
  on("$", literal("$"), ...ident, paint("function")),
  on(
    ".0123456789",
    choice(
      [literal("0x"), ...digits(hex), optional(...intSuffix)],
      [...integer, literal("."), bytes(digit, { min: 0 }), ...exponent, optional(...floatSuffix)],
      [...integer, ...exponent, optional(...floatSuffix)],
      [...integer, literal("."), ...decimal, optional(...floatSuffix)],
      [literal("."), ...decimal, optional(...floatSuffix)],
      [...integer, ...floatSuffix],
      [...integer, optional(...intSuffix)],
    ),
    paint("number"),
  ),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    classify(cases, [paint("function")]),
  ),
  on(upper, ...ident, classify(cases, [paint("type")])),
  on(start, ...ident, classify(cases, [paint("variable")])),
  token("->", "operator"),
  token("...", "operator"),
  token(oneOf("[]()"), "punctuation.bracket"),
  token(oneOf(".,;:"), "punctuation.delimiter"),
  token(oneOf("+-*/%=!<>&|^~?"), "operator"),
];

export default defineGrammar({
  name: "haxe",
  aliases: ["hx"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("{", "punctuation.bracket", pushState("brace")),
        token("}", "punctuation.bracket"),
        ...code,
      ],
    },
    brace: {
      style: "plain",
      arms: [
        token("{", "punctuation.bracket", pushState("brace")),
        token("}", "punctuation.bracket", popState()),
        ...code,
      ],
    },
    interpolation: {
      style: "plain",
      arms: [
        token("{", "punctuation.bracket", pushState("brace")),
        token("}", "punctuation.special", popState()),
        ...code,
      ],
    },
    typeName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(
          start,
          ...ident,
          classify(keywordTable(["class", "enum", "abstract"], "keyword"), [
            paint("type"),
            popState(),
          ]),
        ),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("*/", "comment", popState())],
    },
    double: {
      style: "string",
      arms: [stringEscape, token('"', "string", popState())],
    },
    single: {
      style: "string",
      arms: [
        stringEscape,
        token("$$", "string.escape"),
        token("${", "punctuation.special", pushState("interpolation")),
        on("$", literal("$"), ...ident, paint("punctuation.special")),
        token("'", "string", popState()),
      ],
    },
    regex: {
      style: "string",
      arms: [
        regexEscape,
        on("/", literal("/"), bytes("gimsu", { min: 0 }), paint("string"), popState()),
        redispatch("\r\n", popState()),
      ],
    },
  },
});
