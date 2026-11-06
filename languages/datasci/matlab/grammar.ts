import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineEnd,
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
  setState,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const start = union(range("a", "z"), range("A", "Z"), high);
const rest = union(start, digit, "_");
const ident = [byte(start), bytes(rest, { min: 0 })];
const horizontal = " \t\r";
const hex = union(digit, range("a", "f"), range("A", "F"));
const number = [
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("bB"), bytes("01")],
    [
      choice(
        [bytes(digit), optional(literal("."), notNext(".'"), bytes(digit, { min: 0 }))],
        [literal("."), bytes(digit)],
      ),
      optional(byte("eEdD"), optional(byte("+-")), bytes(digit)),
      optional(byte("iIjJ")),
    ],
  ),
];
const keywords = [
  "if",
  "elseif",
  "else",
  "for",
  "parfor",
  "while",
  "switch",
  "case",
  "otherwise",
  "try",
  "catch",
  "return",
  "break",
  "continue",
  "global",
  "persistent",
  "classdef",
  "properties",
  "methods",
  "events",
  "enumeration",
  "arguments",
  "spmd",
  "import",
];
const constants = ["true", "false", "Inf", "NaN", "pi", "eps"];
const commands = [
  "hold",
  "format",
  "disp",
  "grid",
  "axis",
  "shading",
  "colormap",
  "view",
  "cd",
  "addpath",
  "rmpath",
  "path",
  "clear",
  "close",
  "load",
  "save",
  "set",
  "title",
  "xlabel",
  "ylabel",
  "zlabel",
  "legend",
  "warning",
  "echo",
  "diary",
  "more",
  "type",
  "delete",
  "edit",
  "open",
  "help",
  "doc",
  "which",
  "whos",
];
const groups = [
  ["root", ""],
  ["paren", ")"],
  ["matrix", "]"],
  ["cell", "}"],
] as const;
const stateName = (group: string, value: boolean) => `${group}${value ? "Value" : "Expr"}`;
const blockOpen = on(
  union(horizontal, "%"),
  lineStart(),
  bytes(horizontal, { min: 0 }),
  literal("%{"),
  bytes(horizontal, { min: 0 }),
  lineEnd(),
  paint("comment"),
  pushState("blockComment"),
);
function code(group: string, value: boolean, closing: string, statement = false): Arm[] {
  const expr = stateName(group, false),
    after = stateName(group, true);
  const cases = [
    { text: "function", then: [paint("keyword"), setState(expr), pushState("functionHeader")] },
    ...keywordTable(keywords, "keyword", () => [setState(expr)]),
    ...keywordTable(
      ["end"],
      group === "paren" || group === "cell" ? "constant.builtin" : "keyword",
      () => [setState(after)],
    ),
    ...keywordTable(constants, "constant.builtin", () => [setState(after)]),
  ];
  return [
    ...(closing ? [token(closing, "punctuation.bracket", popState())] : []),
    blockOpen,
    on("\n", literal("\n"), paint("plain"), setState(group === "root" ? "rootStart" : expr)),
    ...(value && (group === "matrix" || group === "cell")
      ? [on(" \t", bytes(" \t"), paint("plain"), setState(expr))]
      : []),
    token("...", "comment", pushState("continuation")),
    token("%", "comment", pushState("lineComment")),
    token('"', "string", setState(after), pushState("doubleString")),
    ...(!value ? [token("'", "string", setState(after), pushState("singleString"))] : []),
    token(".'", "operator", setState(after)),
    token("'", "operator", setState(after)),
    ...(statement
      ? [
          on(
            start,
            ...ident,
            lookahead(bytes(" \t"), byte(union(start, "'\""))),
            classify(
              [
                ...cases,
                ...keywordTable(commands, "function", () => [
                  setState(expr),
                  pushState("commandArgs"),
                ]),
              ],
              [paint("variable"), setState(after)],
            ),
          ),
        ]
      : []),
    on(union(digit, "."), ...number, paint("number"), setState(after)),
    on(
      start,
      ...ident,
      lookahead(bytes(" \t", { min: 0 }), literal("(")),
      classify(cases, [paint("function"), setState(after)]),
    ),
    on(start, ...ident, classify(cases, [paint("variable"), setState(after)])),
    token("(", "punctuation.bracket", setState(after), pushState("parenExpr")),
    token("[", "punctuation.bracket", setState(after), pushState("matrixExpr")),
    token("{", "punctuation.bracket", setState(after), pushState("cellExpr")),
    ...[".*", "./", ".\\", ".^", "~=", "==", "<=", ">=", "&&", "||"].map((s) =>
      token(s, "operator", setState(expr)),
    ),
    token(".", "punctuation.special", setState(after), pushState("field")),
    token(oneOf(",;"), "punctuation.delimiter", setState(group === "root" ? "rootStart" : expr)),
    on(
      "@",
      literal("@"),
      lookahead(literal("(")),
      paint("operator"),
      setState(expr),
      pushState("anonymousOpen"),
    ),
    token("@", "operator", setState(after), pushState("handle")),
    token(oneOf("+-*/\\^=<>~&|:"), "operator", setState(expr)),
    token(oneOf(")]}"), "punctuation.bracket", setState(after)),
  ];
}
const states: Record<string, State> = {};
for (const [group, close] of groups)
  for (const value of [false, true])
    states[stateName(group, value)] = { style: "plain", arms: code(group, value, close) };
states.rootStart = { style: "plain", arms: code("root", false, "", true) };
Object.assign(states, {
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  continuation: { style: "comment", arms: [token("\n", "plain", popState())] },
  blockComment: {
    style: "comment",
    arms: [
      on(
        union(horizontal, "%"),
        lineStart(),
        bytes(horizontal, { min: 0 }),
        literal("%{"),
        bytes(horizontal, { min: 0 }),
        lineEnd(),
        paint("comment"),
        pushState("blockComment"),
      ),
      on(
        union(horizontal, "%"),
        lineStart(),
        bytes(horizontal, { min: 0 }),
        literal("%}"),
        bytes(horizontal, { min: 0 }),
        lineEnd(),
        paint("comment"),
        popState(),
      ),
    ],
  },
  singleString: {
    style: "string",
    arms: [
      token("''", "string.escape"),
      token("'", "string", popState()),
      redispatch("\n", popState()),
    ],
  },
  doubleString: {
    style: "string",
    arms: [
      token('""', "string.escape"),
      token('"', "string", popState()),
      redispatch("\n", popState()),
    ],
  },
  field: {
    style: "plain",
    arms: [
      on(
        start,
        ...ident,
        lookahead(bytes(" \t", { min: 0 }), byte("({")),
        paint("function"),
        popState(),
      ),
      on(start, ...ident, paint("variable.member"), popState()),
    ],
    otherwise: [popState()],
  },
  anonymousOpen: {
    style: "plain",
    arms: [token("(", "punctuation.bracket", setState("parenExpr"))],
  },
  handle: {
    style: "plain",
    arms: [on(start, ...ident, paint("function"), popState())],
    otherwise: [popState()],
  },
  commandArgs: {
    style: "plain",
    arms: [
      redispatch("\n;,%", popState()),
      token("...", "comment", pushState("continuation")),
      token("'", "string", pushState("singleString")),
      token('"', "string", pushState("doubleString")),
      on(start, ...ident, paint("string")),
    ],
  },
  functionHeader: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      token("[", "punctuation.bracket", pushState("functionOutputs")),
      on(start, ...ident, lookahead(bytes(" \t", { min: 0 }), literal("=")), paint("variable")),
      token("=", "operator"),
      on(start, ...ident, paint("function"), popState()),
    ],
    otherwise: [popState()],
  },
  functionOutputs: {
    style: "plain",
    arms: [
      token("]", "punctuation.bracket", popState()),
      token(",", "punctuation.delimiter"),
      on(start, ...ident, paint("variable")),
    ],
  },
});
export default defineGrammar({ name: "matlab", initial: "rootStart", states });
