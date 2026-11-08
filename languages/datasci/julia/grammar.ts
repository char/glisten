import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notLookahead,
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
  type Arm,
  type State,
} from "#/grammar/mod.ts";
import { unicodeOperators } from "./operators.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const high = byteSet({ ranges: [[128, 255]] });
const asciiStart = union("_", range("a", "z"), upper);
const asciiRest = union(asciiStart, digit);
const prefixes = new Map<string, number[]>();
for (const symbol of unicodeOperators) {
  const encoded = [...new TextEncoder().encode(symbol)];
  const key = encoded.slice(0, -1).join(",");
  const group = prefixes.get(key) ?? [];
  group.push(encoded.at(-1)!);
  prefixes.set(key, group);
}
const unicodeOp = choice(
  ...[...prefixes].map(([prefix, last]) => [
    ...prefix.split(",").map((n) => byte(byteSet({ bytes: [Number(n)] }))),
    byte(byteSet({ bytes: last })),
  ]),
);
const unicodeIdentifier = [lookahead(byte(high)), notLookahead(unicodeOp), character()];
const start = union(asciiStart, high);
const ident = [
  choice([byte(asciiStart)], unicodeIdentifier),
  repeat(choice([byte(asciiRest)], unicodeIdentifier)),
  optional(literal("!"), notNext("=")),
];
const gap = bytes(" \t\r\n", { min: 0 });
const keywords = `
  begin let if elseif else for while in isa try catch finally struct mutable module baremodule
  using import export public quote do return const global local where break continue outer as
`
  .trim()
  .split(/\s+/);
const constants = `
  true false nothing missing NaN NaN16 NaN32 Inf Inf16 Inf32
`
  .trim()
  .split(/\s+/);
const hex = union(digit, range("a", "f"), range("A", "F"));
const dec = union(digit, "_");
const number = [
  choice(
    [
      literal("0"),
      byte("xX"),
      bytes(union(hex, "_")),
      optional(literal("."), bytes(union(hex, "_"), { min: 0 })),
      optional(byte("pP"), optional(byte("+-")), bytes(dec)),
    ],
    [literal("0"), byte("oO"), bytes("01234567_")],
    [literal("0"), byte("bB"), bytes("01_")],
    [
      choice(
        [
          byte(digit),
          bytes(dec, { min: 0 }),
          optional(literal("."), notNext("."), bytes(dec, { min: 0 })),
        ],
        [literal("."), byte(digit), bytes(dec, { min: 0 })],
      ),
      optional(
        choice(
          [byte("eE"), optional(byte("+-")), bytes(dec)],
          [byte("fF"), optional(byte("+-")), bytes(dec)],
        ),
      ),
    ],
  ),
];
const escapeBody = choice(
  [byte("uU"), bytes(hex, { min: 1, max: 8 })],
  [literal("x"), bytes(hex, { min: 1, max: 2 })],
  [bytes("01234567", { min: 1, max: 3 })],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const interpolation = [
  on(
    "$",
    literal("$"),
    lookahead(literal("(")),
    paint("punctuation.special"),
    pushState("interpOpen"),
  ),
  on("$", literal("$"), lookahead(...ident), paint("punctuation.special"), pushState("interpName")),
];
const groups = [
  ["root", ""],
  ["paren", ")"],
  ["bracket", "]"],
  ["brace", "}"],
  ["interp", ")"],
] as const;
const stateName = (group: string, value: boolean) => `${group}${value ? "Value" : "Expr"}`;
function code(group: string, value: boolean, closing: string): Arm[] {
  const expr = stateName(group, false),
    after = stateName(group, true);
  const cases = [
    { text: "function", then: [paint("keyword"), setState(expr), pushState("functionName")] },
    { text: "macro", then: [paint("keyword"), setState(expr), pushState("functionName")] },
    ...keywordTable(["abstract", "primitive"], "keyword", () => [
      setState(expr),
      pushState("typeKeyword"),
    ]),
    ...keywordTable(
      group === "bracket" ? keywords.filter((word) => word !== "begin") : keywords,
      "keyword",
      () => [setState(expr)],
    ),
    ...(group === "bracket"
      ? keywordTable(["begin"], "constant.builtin", () => [setState(after)])
      : []),
    ...keywordTable(["end"], group === "bracket" ? "constant.builtin" : "keyword", () => [
      setState(after),
    ]),
    ...keywordTable(constants, "constant.builtin", () => [setState(after)]),
  ];
  return [
    ...(closing ? [token(closing, "punctuation.bracket", popState())] : []),
    on("\n", literal("\n"), paint("plain"), setState(expr)),
    token("#=", "comment", pushState("blockComment")),
    token("#", "comment", pushState("lineComment")),
    on(
      start,
      ...ident,
      lookahead(literal('"')),
      paint("function"),
      setState(after),
      pushState("prefixedOpen"),
    ),
    token('"""', "string", setState(after), pushState("tripleString")),
    token('"', "string", setState(after), pushState("string")),
    token("`", "string", setState(after), pushState("command")),
    ...(!value
      ? [
          on(
            "'",
            literal("'"),
            choice([literal("\\"), escapeBody], [character()]),
            literal("'"),
            paint("string"),
            setState(after),
          ),
        ]
      : []),
    token("'", "operator", setState(after)),
    on("@", literal("@"), ...ident, paint("function"), setState(expr)),
    token("@.", "function", setState(expr)),
    ...(!value
      ? [on(":", literal(":"), ...ident, paint("constant.builtin"), setState(after))]
      : []),
    on(
      "$",
      literal("$"),
      paint("punctuation.special"),
      setState(after),
      pushState("codeInterpolation"),
    ),
    on(union(digit, "."), ...number, paint("number"), setState(after)),
    on(high, unicodeOp, paint("operator"), setState(expr)),
    on(
      start,
      ...ident,
      lookahead(gap, choice([literal("(")], [literal("."), literal("(")])),
      classify(cases, [paint("function"), setState(after)]),
    ),
    on(upper, ...ident, classify(cases, [paint("type"), setState(after)])),
    on(start, ...ident, classify(cases, [paint("variable"), setState(after)])),
    token("(", "punctuation.bracket", setState(after), pushState("parenExpr")),
    token("[", "punctuation.bracket", setState(after), pushState("bracketExpr")),
    token("{", "punctuation.bracket", setState(after), pushState("braceExpr")),
    token("...", "punctuation.special", setState(after)),
    ...[
      "::",
      "<:",
      ">:",
      "=>",
      "->",
      "==",
      "===",
      "!==",
      "!=",
      "<=",
      ">=",
      "&&",
      "||",
      "|>",
      ".|>",
      "+=",
      "-=",
      "*=",
      "/=",
      "//",
      "^=",
      "<<",
      ">>",
      "...",
    ]
      .sort((a, b) => b.length - a.length)
      .map((s) => token(s, "operator", setState(expr))),
    on(".", literal("."), unicodeOp, paint("operator"), setState(expr)),
    on(".", literal("."), bytes("+-*/%=!<>&|^~\\"), paint("operator"), setState(expr)),
    token(".", "punctuation.special", setState(after), pushState("field")),
    token(oneOf(",;"), "punctuation.delimiter", setState(expr)),
    token(oneOf("+-*/%=!<>&|^~?:\\"), "operator", setState(expr)),
    token(oneOf(")]}"), "punctuation.bracket", setState(after)),
  ];
}
const states: Record<string, State> = {};
for (const [group, close] of groups)
  for (const value of [false, true])
    states[stateName(group, value)] = { style: "plain", arms: code(group, value, close) };
Object.assign(states, {
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  blockComment: {
    style: "comment",
    arms: [token("#=", "comment", pushState("blockComment")), token("=#", "comment", popState())],
  },
  string: { style: "string", arms: [escape, ...interpolation, token('"', "string", popState())] },
  tripleString: {
    style: "string",
    arms: [escape, ...interpolation, token('"""', "string", popState())],
  },
  command: { style: "string", arms: [escape, ...interpolation, token("`", "string", popState())] },
  prefixedOpen: {
    style: "string",
    arms: [
      token('"""', "string", setState("prefixedTriple")),
      token('"', "string", setState("prefixedString")),
    ],
  },
  prefixedString: {
    style: "string",
    arms: [
      on("\\", literal("\\"), character(), paint("string")),
      on(
        '"',
        literal('"'),
        bytes(union(range("a", "z"), upper), { min: 0 }),
        paint("string"),
        popState(),
      ),
    ],
  },
  prefixedTriple: {
    style: "string",
    arms: [
      on("\\", literal("\\"), character(), paint("string")),
      on(
        '"',
        literal('"""'),
        bytes(union(range("a", "z"), upper), { min: 0 }),
        paint("string"),
        popState(),
      ),
    ],
  },
  interpOpen: { style: "plain", arms: [token("(", "punctuation.bracket", setState("interpExpr"))] },
  interpName: { style: "plain", arms: [on(start, ...ident, paint("variable"), popState())] },
  codeInterpolation: {
    style: "plain",
    arms: [
      token("(", "punctuation.bracket", setState("interpExpr")),
      on(start, ...ident, paint("variable"), popState()),
    ],
    otherwise: [popState()],
  },
  typeKeyword: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      token("#=", "comment", pushState("blockComment")),
      token("#", "comment", pushState("lineComment")),
      on("t", literal("type"), notNext(union(asciiRest, high, "!")), paint("keyword"), popState()),
    ],
    otherwise: [popState()],
  },
  functionName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      token("#=", "comment", pushState("blockComment")),
      token("#", "comment", pushState("lineComment")),
      on(start, ...ident, lookahead(literal(".")), paint("variable")),
      token(".", "punctuation.special"),
      on(start, ...ident, paint("function"), popState()),
      on(high, unicodeOp, paint("function"), popState()),
      on("+-*/%=!<>&|^~", bytes("+-*/%=!<>&|^~"), paint("function"), popState()),
    ],
    otherwise: [popState()],
  },
  field: {
    style: "plain",
    arms: [
      on(start, ...ident, lookahead(gap, literal("(")), paint("function"), popState()),
      on(start, ...ident, paint("variable.member"), popState()),
    ],
    otherwise: [popState()],
  },
});
// Unicode identifier categories and numeric underscore validity are approximated.
// Value/expression context for adjoints is lexical; indexing `end` is recognized in the immediate bracket state.
export default defineGrammar({ name: "julia", aliases: ["jl"], initial: "rootExpr", states });
