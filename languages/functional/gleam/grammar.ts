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

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const rest = union(lower, upper, digit, "_");
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = (set = digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const word = [byte(lower), bytes(rest, { min: 0 })];
const words = [
  ...keywordTable(
    `
      as assert case const echo external fn if import let opaque panic pub todo type use
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(["True", "False", "Nil"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice([literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")], [character()]),
  paint("string.escape"),
);
// Uppercase constructors and types share a style; labels and calls are recognized lexically, not by scope.
export default defineGrammar({
  name: "gleam",
  extensions: ["gleam"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("//", "comment", pushState("comment")),
        token('"', "string", pushState("string")),
        on("@", literal("@"), ...word, paint("attribute")),
        on(
          digit,
          choice(
            [literal("0x"), ...digits(hex)],
            [literal("0o"), ...digits("01234567")],
            [literal("0b"), ...digits("01")],
            [
              ...digits(),
              optional(
                literal("."),
                notNext("."),
                optional(...digits()),
                optional(literal("e"), optional(literal("-")), ...digits()),
              ),
            ],
          ),
          paint("number"),
        ),
        on("_", literal("_"), bytes(rest, { min: 0 }), paint("variable")),
        on(upper, byte(upper), bytes(rest, { min: 0 }), classify(words, [paint("type")])),
        on(
          lower,
          ...word,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          classify(words, [paint("function")]),
        ),
        on(
          lower,
          ...word,
          lookahead(bytes(" \t", { min: 0 }), literal(":")),
          classify(words, [paint("variable.member")]),
        ),
        on(lower, ...word, classify(words, [paint("variable")])),
        ...[
          "<=.",
          ">=.",
          "==",
          "!=",
          "<=",
          ">=",
          "&&",
          "||",
          "|>",
          "<>",
          "->",
          "<-",
          "..",
          "+.",
          "-.",
          "*.",
          "/.",
          "<.",
          ">.",
        ].map((operator) => token(operator, "operator")),
        token("<<", "punctuation.bracket"),
        token(">>", "punctuation.bracket"),
        token(oneOf("+-*/%!=<>|"), "operator"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(".,:#"), "punctuation.delimiter"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
  },
});
