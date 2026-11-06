import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineStart,
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

const digit = range("0", "9");
const upper = range("A", "Z");
const lower = union(range("a", "z"), "_");
const high = byteSet({ ranges: [[128, 255]] });
const start = union(lower, upper, high);
const rest = union(start, digit, "'");
const symbol = "!#$%&*+./<=>?@\\^|-~:";
const white = " \t\r\n\f\v";
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const keywords =
  "module where import qualified as hiding data newtype type family class instance deriving stock anyclass via let in case of if then else do mdo forall pattern infix infixl infixr foreign export safe unsafe interruptible default role nominal representational phantom rec proc static group by using".split(
    " ",
  );
const ident = [byte(start), bytes(rest, { min: 0 })];
const escapeBody = choice(
  [literal("x"), bytes(union(digit, range("a", "f"), range("A", "F")))],
  [literal("o"), bytes("01234567")],
  [bytes(digit)],
  [literal("^"), byte(range("@", "_"))],
  ..."NUL SOH STX ETX EOT ENQ ACK BEL DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN SUB ESC DEL BS HT LF VT FF CR SO SI EM FS GS RS US SP"
    .split(" ")
    .map((text) => [literal(text)]),
  [byte("abfnrtv\\\"'")],
);

export default defineGrammar({
  name: "haskell",
  aliases: ["hs"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          union(" \t", "#"),
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("#"),
          paint("keyword"),
          pushState("cpp"),
        ),
        token("{-#", "keyword", pushState("pragma")),
        token("{-", "comment", pushState("blockComment")),
        on(
          "-",
          bytes("-", { min: 2 }),
          notNext(symbol),
          paint("comment"),
          pushState("lineComment"),
        ),
        on(
          "[",
          literal("["),
          ...ident,
          bytes(union(rest, "."), { min: 0 }),
          literal("|"),
          paint("string"),
          pushState("quasiquote"),
        ),
        on(
          "'",
          literal("'"),
          choice([literal("\\"), escapeBody], [notNext("'\\\r\n\t\f\v"), character()]),
          literal("'"),
          paint("string"),
        ),
        token("''", "punctuation.special"),
        token("'", "punctuation.special"),
        token('"', "string", pushState("string")),
        on(
          digit,
          choice(
            [literal("0"), byte("xX"), bytes(hex)],
            [literal("0"), byte("oO"), bytes("01234567_")],
            [literal("0"), byte("bB"), bytes("01_")],
            [
              bytes(union(digit, "_")),
              optional(literal("."), bytes(union(digit, "_"))),
              optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
            ],
          ),
          paint("number"),
        ),
        on(
          lower,
          byte(lower),
          bytes(rest, { min: 0 }),
          lookahead(bytes(white, { min: 0 }), literal("::")),
          paint("function"),
        ),
        on(
          lower,
          byte(lower),
          bytes(rest, { min: 0 }),
          classify(keywordTable(keywords, "keyword"), [paint("variable")]),
        ),
        on(union(upper, high), byte(union(upper, high)), bytes(rest, { min: 0 }), paint("type")),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(",;"), "punctuation.delimiter"),
        token("`", "punctuation.special", pushState("infix")),
        on(symbol, bytes(symbol), paint("operator")),
      ],
    },
    infix: {
      style: "plain",
      arms: [
        token("`", "punctuation.special", popState()),
        on(lower, byte(lower), bytes(rest, { min: 0 }), paint("function")),
        on(union(upper, high), byte(union(upper, high)), bytes(rest, { min: 0 }), paint("type")),
        token(".", "operator"),
        redispatch("\r\n", popState()),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("{-", "comment", pushState("blockComment")), token("-}", "comment", popState())],
    },
    pragma: { style: "keyword", arms: [token("#-}", "keyword", popState())] },
    cpp: { style: "keyword", arms: [redispatch("\r\n", popState())] },
    quasiquote: { style: "string", arms: [token("|]", "string", popState())] },
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\"), bytes(white), literal("\\"), paint("string.escape")),
        on("\\", literal("\\"), choice([literal("&")], [escapeBody]), paint("string.escape")),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
  },
});
