import {
  byte,
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
  previousNotIn,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union(lower, upper, "_");
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const ordinal = [literal("@"), bytes(digit)];
const whitespace = optional(bytes(" \t\r\n"));
const exponent = [byte("eE"), optional(byte("+-")), bytes(digit)];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte("abfnrtv'\"\\?")],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [bytes("01234567", { min: 1, max: 3 })],
  ),
  paint("string.escape"),
);
const words = [
  ...keywordTable(
    `
      using import embed struct enum interface union group annotation const extends
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(
    `
      Void Bool Int8 Int16 Int32 Int64 UInt8 UInt16 UInt32 UInt64 Float32 Float64 Text Data List
      AnyPointer AnyStruct AnyList Capability
    `
      .trim()
      .split(/\s+/),
    "type",
  ),
  ...keywordTable(["void", "true", "false"], "constant.builtin"),
  ...keywordTable(["inf", "nan"], "number"),
];

// The syntax distinguishes names by scope; capitalization and ordinal syntax
// approximate that distinction without resolving imports or declarations;
// comments between a name and its ordinal interrupt this classification.
export default defineGrammar({
  name: "capnp",
  extensions: ["capnp"],
  aliases: ["capnproto", "cap'nproto"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        on(
          "@",
          literal("@"),
          choice([literal("0x"), bytes(hex)], [bytes(digit)]),
          notNext(rest),
          paint("label"),
        ),
        token('0x"', "string", pushState("data")),
        token('"', "string", pushState("string")),
        token("`", "string", pushState("blockText")),
        token("$", "punctuation.special", pushState("annotation")),
        on(
          start,
          ...ident,
          lookahead(whitespace, ...ordinal, whitespace, literal("(")),
          paint("function"),
        ),
        on(start, ...ident, lookahead(whitespace, ...ordinal), paint("property")),
        on(upper, ...ident, classify(words, [paint("type")])),
        on(union(lower, "_"), ...ident, classify(words, [paint("plain")])),
        on(
          digit,
          previousNotIn(rest),
          choice(
            [literal("0x"), bytes(hex)],
            [bytes(digit), literal("."), bytes(digit, { min: 0 }), optional(...exponent)],
            [bytes(digit), ...exponent],
            [bytes(digit)],
          ),
          notNext(rest),
          paint("number"),
        ),
        token("->", "punctuation.delimiter"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(",;."), "punctuation.delimiter"),
        token(":", "punctuation.special"),
        token(oneOf("=+-*"), "operator"),
      ],
    },
    annotation: {
      style: "plain",
      arms: [
        on(
          start,
          ...ident,
          classify(
            [{ text: "import", then: [paint("keyword"), setState("annotationTail")] }],
            [paint("attribute"), setState("annotationTail")],
          ),
        ),
      ],
      otherwise: [popState()],
    },
    annotationTail: {
      style: "plain",
      arms: [token(".", "punctuation.delimiter", setState("annotationPart"))],
      otherwise: [popState()],
    },
    annotationPart: {
      style: "plain",
      arms: [on(start, ...ident, paint("attribute"), setState("annotationTail"))],
      otherwise: [popState()],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    // Byte-pair validity is left to the schema compiler, including at EOF.
    data: { style: "string", arms: [token('"', "string", popState())] },
    blockText: { style: "string", arms: [redispatch("\r\n", popState())] },
  },
});
