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
  paint,
  popState,
  pushState,
  range,
  redispatch,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const first = union("_", range("a", "z"), range("A", "Z"));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const gap = bytes(" \t\r\n", { min: 0 });
const hex = union(digit, range("a", "f"), range("A", "F"));
const words = [
  ...keywordTable(
    `permit forbid when unless if then else in has like template`.trim().split(/\s+/),
    "keyword",
  ),
  ...keywordTable(["true", "false"], "constant.builtin"),
];
const comment = token("//", "comment", pushState("comment"));

export default defineGrammar({
  name: "cedar",
  extensions: ["cedar"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        comment,
        token('"', "string", pushState("string")),
        token("@", "punctuation.special", pushState("annotation")),
        on("?", literal("?"), ...name, paint("variable")),
        on(digit, bytes(digit), paint("number")),
        on("i", literal("is"), notNext(rest), paint("keyword"), pushState("typeName")),
        on(first, ...name, lookahead(gap, literal("::")), paint("type")),
        on(first, ...name, lookahead(gap, literal(":"), notNext(":")), paint("property")),
        on(first, ...name, lookahead(gap, literal("(")), classify(words, [paint("function")])),
        on(first, ...name, classify(words, [paint("variable")])),
        token("::", "punctuation.delimiter"),
        token(".", "punctuation.delimiter", pushState("member")),
        token(oneOf(",;:"), "punctuation.delimiter"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf("=<>!&|+-*/%"), "operator"),
      ],
    },
    typeName: {
      style: "plain",
      arms: [
        comment,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(first, ...name, lookahead(gap, literal("::")), paint("type")),
        token("::", "punctuation.delimiter"),
        on(first, ...name, paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(first, ...name, lookahead(gap, literal("(")), paint("function"), popState()),
        on(first, ...name, paint("property"), popState()),
      ],
      otherwise: [popState()],
    },
    annotation: {
      style: "plain",
      arms: [
        comment,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(first, ...name, paint("attribute"), popState()),
      ],
      otherwise: [popState()],
    },
    string: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          choice(
            [literal("x"), bytes(hex, { min: 2, max: 2 })],
            [literal("u{"), bytes(hex), literal("}")],
            [character()],
          ),
          paint("string.escape"),
        ),
        token('"', "string", popState()),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
  },
});
