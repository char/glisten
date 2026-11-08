import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineEnd,
  literal,
  lookahead,
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

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const atomStart = union(lower, high);
const rest = union(lower, upper, digit, "_", high);
const hex = union(digit, range("a", "f"), range("A", "F"));
const alphaNumeric = union(lower, upper, digit);
const whitespace = " \t\r\n\f\v";
const symbols = "#$&*+-./:<=>?@\\^~";
const name = [byte(atomStart), bytes(rest, { min: 0 })];
const digits = (set = digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const words = [
  ...keywordTable(
    `
    is mod rem div rdiv xor not
  `
      .trim()
      .split(/\s+/),
    "operator",
  ),
  ...keywordTable(
    `
      dynamic multifile discontiguous meta_predicate module_transparent thread_local public
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(["true", "false", "fail", "repeat"], "constant.builtin"),
];
const escapeBody = choice(
  [literal("u"), bytes(hex, { min: 4, max: 4 })],
  [literal("U"), bytes(hex, { min: 8, max: 8 })],
  [literal("x"), bytes(hex), optional(literal("\\"))],
  [bytes("01234567"), optional(literal("\\"))],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const lineComment = token("%", "comment", pushState("lineComment"));
const blockComment = token("/*", "comment", pushState("blockComment"));
const quoteStates = (quote: string, style: "string" | "constant.builtin") => ({
  style,
  arms: [escape, token(quote + quote, "string.escape"), token(quote, style, popState())],
});
// A clause begins after a lexical full stop followed by layout/comment/EOF; operators and reader flags can alter this interpretation.
// Quoted or symbolic module qualification, operator-defined heads and Unicode character categories are not parsed.
export default defineGrammar({
  name: "prolog",
  initial: "clauseStart",
  states: {
    clauseStart: {
      style: "plain",
      arms: [
        lineComment,
        blockComment,
        on(whitespace, bytes(whitespace), paint("plain")),
        token(":-", "operator", setState("body")),
        token("?-", "operator", setState("body")),
        token("'", "function", setState("headAtom")),
        on(atomStart, ...name, paint("function"), setState("body")),
      ],
      otherwise: [setState("body")],
    },
    body: {
      style: "plain",
      arms: [
        lineComment,
        blockComment,
        on(
          digit,
          choice(
            [literal("0'"), choice([literal("\\"), escapeBody], [character()])],
            [literal("0x"), ...digits(hex)],
            [literal("0o"), ...digits("01234567")],
            [literal("0b"), ...digits("01")],
            [...digits(), literal("'"), ...digits(alphaNumeric)],
            [
              ...digits(),
              optional(literal("."), ...digits()),
              optional(byte("eE"), optional(byte("+-")), ...digits()),
            ],
          ),
          paint("number"),
        ),
        token("'", "constant.builtin", pushState("atom")),
        token('"', "string", pushState("string")),
        token("`", "string", pushState("backtick")),
        on(union(upper, "_"), byte(union(upper, "_")), bytes(rest, { min: 0 }), paint("variable")),
        on(
          atomStart,
          ...name,
          lookahead(bytes(whitespace, { min: 0 }), literal("(")),
          classify(words, [paint("function")]),
        ),
        on(atomStart, ...name, classify(words, [paint("constant.builtin")])),
        on(
          ".",
          literal("."),
          choice(
            [lookahead(byte(whitespace))],
            [lookahead(literal("%"))],
            [lookahead(literal("/*"))],
            [lineEnd()],
          ),
          paint("punctuation.delimiter"),
          setState("clauseStart"),
        ),
        token(oneOf("()[]{}|"), "punctuation.bracket"),
        token(oneOf(","), "punctuation.delimiter"),
        token(oneOf("!;"), "operator"),
        on(symbols, bytes(symbols), paint("operator")),
      ],
    },
    headAtom: {
      style: "function",
      arms: [escape, token("''", "string.escape"), token("'", "function", setState("body"))],
    },
    atom: quoteStates("'", "constant.builtin"),
    string: quoteStates('"', "string"),
    backtick: quoteStates("`", "string"),
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: { style: "comment", arms: [blockComment, token("*/", "comment", popState())] },
  },
});
