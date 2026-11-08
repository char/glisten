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
  matchRun,
  on,
  oneOf,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  repeat,
  saveRun,
  slot,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const atomStart = union(lower, high);
const variableStart = union(upper, "_");
const rest = union(lower, upper, digit, "_@", high);
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = [byte(digit), repeat(optional(literal("_")), byte(digit))];
const atom = [byte(atomStart), bytes(rest, { min: 0 })];
const keywords = `
  after begin case catch cond end fun if let maybe of receive try when else andalso orelse
`
  .trim()
  .split(/\s+/);
const operators = `
  and or xor not div rem band bor bxor bnot bsl bsr
`
  .trim()
  .split(/\s+/);
const atomCases = [...keywordTable(keywords, "keyword"), ...keywordTable(operators, "operator")];
const quotes = slot.run("tripleQuotes");
const escaped = choice(
  [literal("x{"), bytes(hex), literal("}")],
  [literal("x"), byte(hex), byte(hex)],
  [byte("01234567"), bytes("01234567", { min: 0, max: 2 })],
  [literal("^"), character()],
  [character()],
);
const escape = on("\\", literal("\\"), escaped, paint("string.escape"));
const triple = (prefix: string, state: string) =>
  on(
    prefix ? prefix[0]! : '"',
    literal(prefix),
    bytes('"', { min: 3 }),
    lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), literal("\n")),
    saveRun(quotes),
    paint("string"),
    pushState(state),
  );
const sigils = [
  ["(", ")", "Paren"],
  ["[", "]", "Square"],
  ["{", "}", "Brace"],
  ["<", ">", "Angle"],
  ["/", "/", "Slash"],
  ["|", "|", "Pipe"],
  ["'", "'", "Single"],
  ['"', '"', "Double"],
  ["`", "`", "Backtick"],
  ["#", "#", "Hash"],
] as const;
const sigilOpeners = sigils.flatMap(([open, , suffix]) => [
  on(
    "~",
    literal("~"),
    optional(byte("bs")),
    literal(open),
    paint("string"),
    pushState(`sigil${suffix}`),
  ),
  on("~", literal("~"), byte("BS"), literal(open), paint("string"), pushState(`rawSigil${suffix}`)),
]);
const sigilStates: Record<string, State> = {};
for (const [, close, suffix] of sigils) {
  sigilStates[`sigil${suffix}`] = {
    style: "string",
    arms: [escape, token(close, "string", popState())],
  };
  sigilStates[`rawSigil${suffix}`] = {
    style: "string",
    arms: [token(close, "string", popState())],
  };
}
const closingTriple = on(
  ' \t"',
  lineStart(),
  bytes(" \t", { min: 0 }),
  matchRun(quotes, { relation: "exact" }),
  paint("string"),
  popState(),
);
// Unicode atom categories and numeric base/digit validity are not checked; quoted function names remain atoms.
// Triple-string indentation consistency is not validated; only spaces and tabs are recognized as delimiter-line whitespace.
export default defineGrammar({
  name: "erlang",
  extensions: ["erl", "hrl", "escript"],
  filenames: ["rebar.config", "rebar.lock"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("%", "comment", pushState("comment")),
        on("-", lineStart(), bytes(" \t", { min: 0 }), literal("-"), ...atom, paint("attribute")),
        on(" \t", lineStart(), bytes(" \t"), literal("-"), ...atom, paint("attribute")),
        triple("~b", "escapedTriple"),
        triple("~s", "escapedTriple"),
        triple("~B", "rawTriple"),
        triple("~S", "rawTriple"),
        triple("~", "rawTriple"),
        triple("", "rawTriple"),
        ...sigilOpeners,
        token('"', "string", pushState("string")),
        token("'", "constant.builtin", pushState("quotedAtom")),
        on("$", literal("$"), choice([literal("\\"), escaped], [character()]), paint("number")),
        on(
          "?",
          literal("?"),
          optional(literal("?")),
          byte(union(atomStart, variableStart)),
          bytes(rest, { min: 0 }),
          paint("variable"),
        ),
        on("#", literal("#"), ...atom, paint("type")),
        on(
          digit,
          ...digits,
          literal("#"),
          byte(union(lower, upper, digit)),
          bytes(union(lower, upper, digit, "_"), { min: 0 }),
          paint("number"),
        ),
        on(
          digit,
          ...digits,
          optional(literal("."), ...digits, optional(byte("eE"), optional(byte("+-")), ...digits)),
          paint("number"),
        ),
        on(variableStart, byte(variableStart), bytes(rest, { min: 0 }), paint("variable")),
        on(
          atomStart,
          previousNotIn(rest),
          ...atom,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          classify(atomCases, [paint("function")]),
        ),
        on(
          atomStart,
          previousNotIn(rest),
          ...atom,
          classify(atomCases, [paint("constant.builtin")]),
        ),
        ...[
          "=:=",
          "=/=",
          "->",
          "=>",
          ":=",
          "||",
          "<-",
          "++",
          "--",
          "==",
          "/=",
          "=<",
          ">=",
          "::",
          "..",
          "?=",
          "&&",
        ].map((operator) => token(operator, "operator")),
        token("<<", "punctuation.bracket"),
        token(">>", "punctuation.bracket"),
        token(oneOf("+-*/=<>!|"), "operator"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(".,;:#"), "punctuation.delimiter"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
    quotedAtom: {
      style: "constant.builtin",
      arms: [escape, token("'", "constant.builtin", popState())],
    },
    rawTriple: { style: "string", arms: [closingTriple] },
    escapedTriple: { style: "string", arms: [closingTriple, escape] },
    ...sigilStates,
  },
});
