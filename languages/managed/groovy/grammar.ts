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
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_$", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const keywords = `
  abstract as assert break case catch class const continue def default do else enum extends
  final finally for goto if implements import in instanceof interface native new package
  permits private protected public return sealed static strictfp super switch synchronized
  this threadsafe throw throws trait transient try var volatile while
`
  .trim()
  .split(/\s+/);
const expressionKeywords = new Set(
  `
    as assert case def do else for if in instanceof new return throw var while
  `
    .trim()
    .split(/\s+/),
);
const types = "boolean byte char double float int long short void".split(" ");
const constants = ["true", "false", "null"];
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const escape = on(
  "\\",
  literal("\\"),
  choice([literal("u"), bytes(hex, { min: 4, max: 4 })], [character()]),
  paint("string.escape"),
);
const interpolation = [
  token("${", "punctuation.special", pushState("interpolationStart")),
  on("$", literal("$"), ...ident, repeat(literal("."), ...ident), paint("variable")),
];
type Context = "root" | "block" | "paren" | "bracket" | "interpolation";
type Position = "Start" | "Value" | "After";

function code(context: Context, position: Position) {
  const before = context + "Start";
  const value = context + "Value";
  const after = context + "After";
  const cases = [
    ...keywords.map((text) => ({
      text,
      then: [paint("keyword" as const), setState(expressionKeywords.has(text) ? value : after)],
    })),
    ...keywordTable(types, "type", () => [setState(after)]),
    ...keywordTable(constants, "constant.builtin", () => [setState(after)]),
  ];
  const word = (style: "variable" | "function" | "property", next = after) =>
    classify(cases, [paint(style), setState(next)]);
  const closing = {
    root: [],
    interpolation: [token("}", "punctuation.special", popState())],
    block: [token("}", "punctuation.bracket", popState())],
    paren: [token(")", "punctuation.bracket", popState())],
    bracket: [token("]", "punctuation.bracket", popState())],
  } satisfies Record<Context, ReturnType<typeof token>[]>;
  return [
    ...closing[context],
    ...comments,
    token('"""', "string", setState(after), pushState("tripleDouble")),
    token("'''", "string", setState(after), pushState("tripleSingle")),
    token('"', "string", setState(after), pushState("double")),
    token("'", "string", setState(after), pushState("single")),
    token("$/", "string", setState(after), pushState("dollarSlashy")),
    ...(position !== "After" ? [token("/", "string", setState(after), pushState("slashy"))] : []),
    on("@", literal("@"), ...ident, repeat(literal("."), ...ident), paint("attribute")),
    on("n", literal("non-sealed"), notNext(rest), paint("keyword"), setState(after)),
    on(
      ".0123456789",
      choice(
        [literal("0"), byte("xX"), bytes(union(hex, "_")), optional(byte("lLgG"))],
        [literal("0"), byte("bB"), bytes("01_"), optional(byte("lLgG"))],
        [
          bytes(union(digit, "_")),
          optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
          optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
          optional(byte("fFdDgGlLiI")),
        ],
        [literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 }), optional(byte("fFdDgG"))],
      ),
      paint("number"),
      setState(after),
    ),
    on(start, ...ident, lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")), word("function")),
    ...(position === "Start" && (context === "root" || context === "block")
      ? [
          on(
            union("_$", range("a", "z")),
            ...ident,
            lookahead(bytes(" \t"), byte(union(start, digit, "'\"{$"))),
            word("function", value),
          ),
        ]
      : []),
    on(
      start,
      ...ident,
      lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(":")),
      word("property"),
    ),
    on(range("A", "Z"), ...ident, classify(cases, [paint("type"), setState(after)])),
    on(start, ...ident, word("variable")),
    token("{", "punctuation.bracket", setState(after), pushState("blockStart")),
    token("(", "punctuation.bracket", setState(after), pushState("parenValue")),
    token("[", "punctuation.bracket", setState(after), pushState("bracketValue")),
    ...(context === "root" || context === "block" ? [token("\n", "plain", setState(before))] : []),
    token(";", "punctuation.delimiter", setState(before)),
    token(",", "punctuation.delimiter", setState(value)),
    token(":", "punctuation.delimiter", setState(value)),
    token("?.", "operator", setState(after), pushState("member")),
    token("*.", "operator", setState(after), pushState("member")),
    ...[
      "==~",
      "<=>",
      "..<",
      "...",
      "?:",
      "..",
      "=~",
      "->",
      "==",
      "!=",
      "<=",
      ">=",
      "&&",
      "||",
      "++",
      "--",
      "**",
      "<<",
      ">>",
      "+=",
      "-=",
      "*=",
      "/=",
    ].map((op) => token(op, "operator", setState(["++", "--"].includes(op) ? after : value))),
    token(".", "punctuation.delimiter", setState(after), pushState("member")),
    token(oneOf("+-*/%=!<>&|^~?"), "operator", setState(value)),
  ];
}

export default defineGrammar<string>({
  name: "groovy",
  extensions: ["groovy", "gvy", "gy", "gsh", "gradle"],
  filenames: ["Jenkinsfile"],
  aliases: ["gradle", "gvy"],
  initial: "initial",
  states: {
    initial: {
      style: "plain",
      arms: [token("#!", "comment", setState("rootStart"), pushState("lineComment"))],
      otherwise: [setState("rootStart")],
    },
    ...Object.fromEntries(
      (["root", "block", "paren", "bracket", "interpolation"] as const).flatMap((context) =>
        (["Start", "Value", "After"] as const).map((position) => [
          context + position,
          { style: "plain" as const, arms: code(context, position) },
        ]),
      ),
    ),
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), byte("({")),
          paint("function"),
          popState(),
        ),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    single: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\n\r", popState())],
    },
    double: {
      style: "string",
      arms: [
        escape,
        ...interpolation,
        token('"', "string", popState()),
        redispatch("\n\r", popState()),
      ],
    },
    tripleSingle: { style: "string", arms: [escape, token("'''", "string", popState())] },
    tripleDouble: {
      style: "string",
      arms: [escape, ...interpolation, token('"""', "string", popState())],
    },
    slashy: {
      style: "string",
      arms: [
        on("\\", literal("\\/"), paint("string.escape")),
        ...interpolation,
        token("/", "string", popState()),
      ],
    },
    dollarSlashy: {
      style: "string",
      arms: [
        token("/$", "string", popState()),
        on("$", literal("$"), byte("$/"), paint("string.escape")),
        ...interpolation,
      ],
    },
  },
});
