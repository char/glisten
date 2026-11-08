import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  except,
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

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_$", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const gap = bytes(" \t\r\n", { min: 0 });
const horizontalGap = bytes(" \t", { min: 0 });
const space = bytes(" \t\r\n");
const word = (text: string) => [literal(text), notNext(rest)];
const operators = "!#%&*+-/:<=>?@\\^|~";
const operatorPart = choice([byte(except(operators, "/"))], [literal("/"), notNext("/*")]);
const hex = union(digit, range("a", "f"), range("A", "F"));
const decimal = bytes(union(digit, "_"));
const exponent = [byte("eE"), optional(byte("+-")), decimal];
const hard = `
  abstract case catch class def do else extends final finally for forSome if implicit import
  lazy match new object override package private protected return sealed super this throw
  trait try type val var while with yield
`
  .trim()
  .split(/\s+/);
const words = [
  ...keywordTable(hard, "keyword"),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const backtick = [literal("`"), bytes(except(all, "`\r\n")), literal("`")];
const escapedChar = choice(
  [literal("\\u"), bytes(hex, { min: 4, max: 4 })],
  [literal("\\"), character()],
  [character()],
);
const code = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  // Scala interpolators own their escape semantics; `raw` is special-cased by name.
  on("r", ...word("raw"), lookahead(literal('"')), paint("function"), pushState("rawOpen")),
  on(start, ...ident, lookahead(literal('"')), paint("function"), pushState("interpolatedOpen")),
  token('"""', "string", pushState("triple")),
  token('"', "string", pushState("string")),
  on(
    "'",
    lookahead(literal("'"), escapedChar, literal("'")),
    literal("'"),
    paint("string"),
    pushState("char"),
  ),
  on("'", literal("'"), ...ident, paint("constant.builtin")),
  on("`", ...backtick, lookahead(horizontalGap, byte("([{")), paint("function")),
  on("`", ...backtick, paint("variable")),
  on("@", literal("@"), ...ident, repeat(literal("."), ...ident), paint("attribute")),
  on(
    digit,
    choice(
      [literal("0"), byte("xX"), bytes(union(hex, "_")), optional(byte("lL"))],
      [literal("0"), byte("bB"), bytes("01_"), optional(byte("lL"))],
      [
        decimal,
        optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
        optional(...exponent),
        optional(byte("lLfFdD")),
      ],
    ),
    paint("number"),
  ),
  on("d", ...word("def"), paint("keyword"), pushState("defName")),
  ...["class", "object", "trait", "type"].map((text) =>
    on(text[0]!, ...word(text), paint("keyword"), pushState("typeName")),
  ),
  on("e", ...word("enum"), lookahead(space, ...ident), paint("keyword"), pushState("typeName")),
  // Soft keywords use local spelling: they can be missed or mistaken for ordinary identifiers.
  ...`opaque inline transparent open infix`
    .trim()
    .split(/\s+/)
    .map((text) => on(text[0]!, ...word(text), lookahead(space, ...ident), paint("keyword"))),
  ...`given using derives export end`
    .trim()
    .split(/\s+/)
    .map((text) =>
      on(
        text[0]!,
        ...word(text),
        lookahead(space, choice([byte(start)], [byte("[(_")])),
        paint("keyword"),
      ),
    ),
  on("e", ...word("extension"), lookahead(gap, byte("([")), paint("keyword")),
  on("t", ...word("then"), lookahead(choice([space], [byte("{")])), paint("keyword")),
  on(upper, ...ident, classify(words, [paint("type")])),
  on("_", literal("_"), byte(upper), bytes(rest, { min: 0 }), paint("type")),
  // A following `(`, `[` or `{` on the same line approximates calls and type applications.
  on(start, ...ident, lookahead(horizontalGap, byte("([{")), classify(words, [paint("function")])),
  on(start, ...ident, classify(words, [paint("variable")])),
  token(".", "punctuation.delimiter", pushState("member")),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  on(operators, operatorPart, repeat(operatorPart), paint("operator")),
  token(oneOf(",;"), "punctuation.delimiter"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice([literal("u"), bytes(hex, { min: 4, max: 4 })], [character()]),
  paint("string.escape"),
);
const interpolation = [
  token("$$", "string.escape"),
  token("${", "punctuation.special", pushState("template")),
  on("$", literal("$"), ...ident, paint("variable")),
];

// XML literals are not parsed and are styled as Scala tokens. Unicode identifier categories,
// numeric separator placement, character/escape validity and custom interpolator behavior are approximated.
export default defineGrammar({
  name: "scala",
  aliases: ["sc", "sbt"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    defName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on("`", ...backtick, paint("function"), popState()),
        on(start, ...ident, paint("function"), popState()),
        on(operators, operatorPart, repeat(operatorPart), paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    typeName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on("`", ...backtick, paint("type"), popState()),
        on(start, ...ident, paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on("`", ...backtick, lookahead(horizontalGap, byte("([{")), paint("function"), popState()),
        on("`", ...backtick, paint("variable.member"), popState()),
        on(start, ...ident, lookahead(horizontalGap, byte("([{")), paint("function"), popState()),
        on(upper, ...ident, paint("type"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    interpolatedOpen: {
      style: "string",
      arms: [
        token('"""', "string", setState("interpolatedTriple")),
        token('"', "string", setState("interpolated")),
      ],
    },
    rawOpen: {
      style: "string",
      arms: [
        token('"""', "string", setState("interpolatedTriple")),
        token('"', "string", setState("rawInterpolated")),
      ],
    },
    interpolated: {
      style: "string",
      arms: [
        escape,
        ...interpolation,
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    rawInterpolated: {
      style: "string",
      arms: [...interpolation, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    interpolatedTriple: {
      style: "string",
      arms: [...interpolation, token('"""', "string", popState())],
    },
    template: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("templateBrace")),
        ...code,
      ],
    },
    templateBrace: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("templateBrace")),
        ...code,
      ],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    triple: { style: "string", arms: [token('"""', "string", popState())] },
    char: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\r\n", popState())],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
  },
});
