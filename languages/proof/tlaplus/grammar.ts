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
  token,
  union,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const letter = union(lower, upper, "_");
const rest = union(letter, digit);
const hex = union(digit, range("a", "f"), range("A", "F"));
const white = " \t\r\n\f";
const ident = [byte(letter), bytes(rest, { min: 0 })];
const keywords = `
  ACTION ASSUME ASSUMPTION AXIOM BY CASE CHOOSE CONSTANT CONSTANTS COROLLARY DEF DEFINE DEFS
  DOMAIN ELSE ENABLED EXCEPT EXTENDS HAVE HIDE IF IN INSTANCE LAMBDA LEMMA LET LOCAL MODULE NEW
  OBVIOUS OMITTED ONLY OTHER PICK PROOF PROPOSITION PROVE QED RECURSIVE STATE SUBSET SUFFICES TAKE
  TEMPORAL THEN THEOREM UNCHANGED UNION USE VARIABLE VARIABLES WITH WITNESS
`
  .trim()
  .split(/\s+/);
const pcalKeywords = `
  algorithm assert await begin call define do either else elsif end fair goto if macro or print
  procedure process return skip then variable variables when while with
`
  .trim()
  .split(/\s+/);
const cases = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["TRUE", "FALSE"], "constant.builtin"),
  ...keywordTable(["BOOLEAN", "STRING"], "type"),
];
const pcalCases = [...cases, ...keywordTable(pcalKeywords, "keyword")];
const lineComment = token("\\*", "comment", pushState("lineComment"));
const blockComment = token("(*", "comment", pushState("blockComment"));
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const operators = [
  "|->",
  "<=>",
  "=>",
  "<=",
  ">=",
  "/\\",
  "\\/",
  "[]",
  "<>",
  "~>",
  ":>",
  "@@",
  "==",
  ":=",
  "->",
  "..",
  "∀",
  "∃",
  "∧",
  "∨",
  "⇒",
  "⇔",
  "∈",
  "∉",
  "⊆",
  "⊂",
  "∪",
  "∩",
  "□",
  "◇",
  "×",
  "¬",
  "≠",
  "≤",
  "≥",
];
const common = [
  lineComment,
  token('"', "string", pushState("string")),
  on("\\", literal("\\"), byte("bB"), bytes("01"), paint("number")),
  on("\\", literal("\\"), byte("oO"), bytes("01234567"), paint("number")),
  on("\\", literal("\\"), byte("hH"), bytes(hex), paint("number")),
  on(digit, bytes(digit), optional(literal("."), bytes(digit)), paint("number")),
  ...operators.map((s) => token(s, "operator")),
  on("\\", literal("\\"), bytes(union(lower, upper)), paint("operator")),
  token("<<", "punctuation.bracket"),
  token(">>", "punctuation.bracket"),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;:.!"), "punctuation.delimiter"),
  token(oneOf("'+-*/=<>|&~^@%#"), "operator"),
];
// PlusCal is recognized only when its marker immediately follows the opening comment and layout.
// Labels and simple operator definitions are lexical heuristics, not parsed declarations.
export default defineGrammar({
  name: "tlaplus",
  extensions: ["tla"],
  aliases: ["tla"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          "(",
          literal("(*"),
          lookahead(
            bytes(white, { min: 0 }),
            choice(
              [literal("--algorithm")],
              [literal("--fair"), bytes(white), literal("algorithm")],
            ),
          ),
          paint("comment"),
          pushState("pluscal"),
        ),
        blockComment,
        on("-", bytes("-", { min: 4 }), paint("punctuation.special")),
        on("=", bytes("=", { min: 4 }), paint("punctuation.special")),
        ...common,
        on(
          letter,
          ...ident,
          lookahead(
            bytes(white, { min: 0 }),
            literal("("),
            bytes(union(rest, white, ","), { min: 0 }),
            literal(")"),
            bytes(white, { min: 0 }),
            literal("=="),
            notNext("="),
          ),
          classify(cases, [paint("function")]),
        ),
        on(
          letter,
          ...ident,
          lookahead(bytes(white, { min: 0 }), literal("=="), notNext("=")),
          classify(cases, [paint("function")]),
        ),
        on(letter, ...ident, classify(cases, [paint("variable")])),
      ],
    },
    pluscal: {
      style: "plain",
      arms: [
        token("*)", "comment", popState()),
        blockComment,
        token("--algorithm", "keyword"),
        token("--fair", "keyword"),
        ...common,
        on(
          letter,
          ...ident,
          lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext("=")),
          classify(pcalCases, [paint("label")]),
        ),
        on(letter, ...ident, classify(pcalCases, [paint("variable")])),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: { style: "comment", arms: [blockComment, token("*)", "comment", popState())] },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
  },
});
