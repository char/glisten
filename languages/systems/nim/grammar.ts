import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  defineGrammar,
  except,
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
  type Effect,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const keywordNames =
  "addr and as asm bind block break case cast concept const continue converter defer discard distinct div do elif else end enum except export finally for from func if import in include interface is isnot iterator let macro method mixin mod not notin object of or out proc ptr raise ref return shl shr static template try tuple type using var when while xor yield".split(
    " ",
  );
const definitions = new Set([
  "proc",
  "func",
  "method",
  "iterator",
  "converter",
  "macro",
  "template",
]);
const builtinTypes =
  "int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float float32 float64 bool char string cstring pointer void byte typed untyped auto any seq array openArray varargs range set Natural Positive BiggestInt BiggestUInt".split(
    " ",
  );
function nimWord(word: string, ...effects: Effect[]): Arm {
  return on(
    word[0]!,
    literal(word[0]!),
    ...[...word.slice(1)].flatMap((c) => [
      optional(literal("_")),
      byte(c.toLowerCase() + c.toUpperCase()),
    ]),
    notNext(rest),
    ...effects,
  );
}
const words: Arm[] = [
  ...keywordNames.map((word) =>
    nimWord(word, paint("keyword"), ...(definitions.has(word) ? [pushState("definition")] : [])),
  ),
  ...["nil", "true", "false"].map((word) => nimWord(word, paint("constant.builtin"))),
  ...builtinTypes.map((word) => nimWord(word, paint("type"))),
];
const dec = union(digit, "_");
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("oO"), bytes("01234567_")],
    [literal("0"), byte("bB"), bytes("01_")],
    [
      bytes(dec),
      optional(literal("."), notNext("."), byte(digit), bytes(dec, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), byte(digit), bytes(dec, { min: 0 })),
    ],
  ),
  optional(literal("'"), byte("iIuUfF"), bytes(digit, { min: 0 })),
  paint("number"),
);
const escapeBody = choice(
  [byte("xX"), byte(hex), byte(hex)],
  [byte("uU"), byte(hex), byte(hex), byte(hex), byte(hex)],
  [byte(digit), bytes(digit, { min: 0, max: 2 })],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const code: Arm[] = [
  token("##[", "comment", pushState("docBlock")),
  token("#[", "comment", pushState("blockComment")),
  token("#", "comment", pushState("lineComment")),
  token("{.", "punctuation.special", pushState("pragma")),
  token('"""', "string", pushState("triple")),
  on(start, ...ident, literal('"""'), paint("string"), pushState("triple")),
  on(start, ...ident, literal('"'), paint("string"), pushState("raw")),
  token('"', "string", pushState("string")),
  on(
    "'",
    literal("'"),
    lookahead(choice([literal("\\"), escapeBody], [character()]), literal("'")),
    paint("string"),
    pushState("char"),
  ),
  number,
  ...words,
  on(
    "`",
    literal("`"),
    bytes(except(all, "`\r\n"), { min: 1 }),
    literal("`"),
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    paint("function"),
  ),
  token("`", "variable", pushState("backtick")),
  on(upper, ...ident, paint("type")),
  on(start, ...ident, lookahead(bytes(" \t", { min: 0 }), literal("(")), paint("function")),
  on(start, ...ident, paint("variable")),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  on(
    ".:",
    byte(".:"),
    byte("=+-*/\\<>!?^.|%&$@~:"),
    bytes("=+-*/\\<>!?^.|%&$@~:", { min: 0 }),
    paint("operator"),
  ),
  token(oneOf(",;:."), "punctuation.delimiter"),
  on("=+-*/\\<>!?^|%&$@~", bytes("=+-*/\\<>!?^.|%&$@~:"), paint("operator")),
];
export default defineGrammar({
  name: "nim",
  aliases: ["nimrod"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [
        token("##[", "comment", pushState("docBlock")),
        token("#[", "comment", pushState("blockComment")),
        token("]#", "comment", popState()),
      ],
    },
    docBlock: {
      style: "comment",
      arms: [
        token("##[", "comment", pushState("docBlock")),
        token("#[", "comment", pushState("blockComment")),
        token("]##", "comment", popState()),
      ],
    },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
    char: { style: "string", arms: [escape, token("'", "string", popState())] },
    raw: { style: "string", arms: [token('""', "string"), token('"', "string", popState())] },
    triple: {
      style: "string",
      arms: [on('"', bytes('"', { min: 3 }), paint("string"), popState())],
    },
    backtick: { style: "variable", arms: [token("`", "variable", popState())] },
    definition: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, paint("function"), popState()),
        token("`", "function", setState("definitionBacktick")),
        on("=+-*/\\<>!?^.|%&$@~:", bytes("=+-*/\\<>!?^.|%&$@~:"), paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    definitionBacktick: { style: "function", arms: [token("`", "function", popState())] },
    pragma: {
      style: "plain",
      arms: [
        token(".}", "punctuation.special", popState()),
        on(start, ...ident, paint("attribute")),
        ...code,
      ],
    },
  },
});
