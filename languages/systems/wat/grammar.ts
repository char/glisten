import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
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
const idchar = union(range("a", "z"), range("A", "Z"), digit, "!#$%&'*+-./:<=>?@\\^_`|~");
const digits = (set: typeof digit) => [bytes(set), repeat(literal("_"), bytes(set))];
const decimal = digits(digit);
const hexadecimal = digits(hex);
const exponent = (marker: string) => [byte(marker), optional(byte("+-")), ...decimal];
const number = on(
  union(digit, "+-in"),
  optional(byte("+-")),
  choice(
    [literal("nan:0x"), ...hexadecimal, notNext(idchar)],
    [literal("nan:canonical"), notNext(idchar)],
    [literal("nan:arithmetic"), notNext(idchar)],
    [literal("nan"), notNext(idchar)],
    [literal("inf"), notNext(idchar)],
    [
      literal("0x"),
      ...hexadecimal,
      optional(literal("."), optional(...hexadecimal)),
      optional(...exponent("pP")),
      notNext(idchar),
    ],
    [
      ...decimal,
      optional(literal("."), optional(...decimal)),
      optional(...exponent("eE")),
      notNext(idchar),
    ],
  ),
  paint("number"),
);
const types = keywordTable(
  [
    "i32",
    "i64",
    "f32",
    "f64",
    "v128",
    "i8",
    "i16",
    "funcref",
    "externref",
    "anyref",
    "eqref",
    "i31ref",
    "structref",
    "arrayref",
    "nullref",
    "nullfuncref",
    "nullexternref",
    "exnref",
    "nullexnref",
    "func",
    "extern",
    "any",
    "eq",
    "i31",
    "struct",
    "array",
    "none",
    "nofunc",
    "noextern",
    "exn",
    "noexn",
  ],
  "type",
).filter(({ text }) => text !== "func");

export default defineGrammar({
  name: "wat",
  aliases: ["wast"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token(";;", "comment", pushState("lineComment")),
        token("(;", "comment", pushState("blockComment")),
        token(oneOf("()"), "punctuation.bracket"),
        token('"', "string", pushState("string")),
        on("$", literal("$"), bytes(idchar), paint("variable")),
        on("@", literal("@"), bytes(idchar), paint("punctuation.special")),
        ...["offset=", "align="].map((text) => token(text, "property")),
        number,
        on(idchar, bytes(idchar), classify(types, [paint("keyword")])),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("(;", "comment", pushState("blockComment")), token(";)", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\u{"), ...hexadecimal, literal("}"), paint("string.escape")),
        on("\\", literal("\\"), byte(hex), byte(hex), paint("string.escape")),
        on("\\", literal("\\"), byte("tnr\"'\\"), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
  },
});
