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
  redispatch,
  token,
  union,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const rest = union(lower, upper, digit, "_", high);
const hex = union(digit, range("a", "f"), range("A", "F"));
const name = [byte(lower), bytes(rest, { min: 0 })];
const keywords = `
  as case effect else exposing if import in infix left let module non of port right then type alias
  where
`
  .trim()
  .split(/\s+/);
const cases = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["True", "False"], "constant.builtin"),
];
const escapeBody = choice(
  [literal("u{"), bytes(hex, { min: 4, max: 6 }), literal("}")],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
// Calls without parentheses, module qualifiers and record labels cannot be resolved lexically.
export default defineGrammar({
  name: "elm",
  extensions: ["elm"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("--", "comment", pushState("lineComment")),
        token("{-", "comment", pushState("blockComment")),
        token("[glsl|", "punctuation.special", pushState("shader")),
        token('"""', "string", pushState("tripleString")),
        token('"', "string", pushState("string")),
        on(
          "'",
          literal("'"),
          choice([literal("\\"), escapeBody], [notNext("'\\\r\n"), character()]),
          literal("'"),
          paint("string"),
        ),
        on(
          digit,
          choice(
            [literal("0x"), bytes(hex)],
            [
              bytes(digit),
              optional(literal("."), bytes(digit)),
              optional(byte("eE"), optional(byte("+-")), bytes(digit)),
            ],
          ),
          paint("number"),
        ),
        on(
          lower,
          ...name,
          lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(":")),
          classify(cases, [paint("function")]),
        ),
        on(lower, ...name, classify(cases, [paint("variable")])),
        on("_", literal("_"), bytes(rest, { min: 0 }), paint("variable")),
        on(
          union(upper, high),
          byte(union(upper, high)),
          bytes(rest, { min: 0 }),
          classify(cases, [paint("type")]),
        ),
        token("..", "operator"),
        on(
          ".",
          literal("."),
          lookahead(byte(lower)),
          paint("punctuation.delimiter"),
          pushState("field"),
        ),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(",;"), "punctuation.delimiter"),
        on("+-/*=.$<>:&|^!?%~\\", bytes("+-/*=.$<>:&|^!?%~\\"), paint("operator")),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("{-", "comment", pushState("blockComment")), token("-}", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    tripleString: { style: "string", arms: [escape, token('"""', "string", popState())] },
    shader: { style: "plain", arms: [token("|]", "punctuation.special", popState())] },
    field: {
      style: "plain",
      arms: [on(lower, ...name, paint("variable.member"), popState())],
    },
  },
});
