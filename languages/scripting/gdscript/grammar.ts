import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  previousNotIn,
  range,
  redispatch,
  repeat,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const words = `
  and as assert await break breakpoint class class_name const continue elif else enum extends for
  func if in is match namespace not or pass preload return signal static super trait var when
  while
`
  .trim()
  .split(/\s+/);
const constants = `
  true false null PI TAU INF NAN
`
  .trim()
  .split(/\s+/);
const types = `
  void bool int float String StringName NodePath Array Dictionary Vector2 Vector2i Vector3
  Vector3i Vector4 Vector4i Rect2 Rect2i Transform2D Transform3D Plane Quaternion AABB Basis
  Projection Color RID Object Callable Signal PackedByteArray PackedInt32Array PackedInt64Array
  PackedFloat32Array PackedFloat64Array PackedStringArray PackedVector2Array PackedVector3Array
  PackedVector4Array PackedColorArray
`
  .trim()
  .split(/\s+/);
const table = [
  ...keywordTable(constants, "constant.builtin"),
  ...keywordTable(types, "type"),
  ...words.map((text) => ({
    text,
    then: [
      paint("keyword" as const),
      ...(text === "func" || text === "signal"
        ? [pushState("functionName")]
        : text === "class" || text === "class_name" || text === "enum"
          ? [pushState("className")]
          : []),
    ],
  })),
];
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = (set = digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const number = on(
  ".0123456789",
  choice(
    [literal("0"), byte("xX"), ...digits(hex)],
    [literal("0"), byte("bB"), ...digits("01")],
    [
      choice(
        [...digits(), literal("."), notNext("."), optional(...digits())],
        [literal("."), ...digits()],
        [...digits()],
      ),
      optional(byte("eE"), optional(byte("+-")), ...digits()),
    ],
  ),
  paint("number"),
);
const quoteStyles = [
  ["'''", "TripleSingle"],
  ['"""', "TripleDouble"],
  ["'", "Single"],
  ['"', "Double"],
] as const;
const openers = quoteStyles.flatMap(([quote, suffix]) => {
  return [
    on("r", literal("r"), literal(quote), paint("string"), pushState("raw" + suffix)),
    on("&^$", byte("&^$"), literal(quote), paint("string"), pushState("string" + suffix)),
    on("'\"", literal(quote), paint("string"), pushState("string" + suffix)),
  ];
});
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("\r\n")],
    [literal("x"), byte(hex), byte(hex)],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [byte("\\'\"abfnrtv\n")],
  ),
  paint("string.escape"),
);
const code = [
  token("#", "comment", pushState("comment")),
  ...openers,
  on("@", literal("@"), ...ident, paint("attribute")),
  on("$", literal("$"), ...ident, repeat(literal("/"), ...ident), paint("string")),
  on("%", previousNotIn(union(rest, ")]}'\"")), literal("%"), ...ident, paint("string")),
  number,
  on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    classify(table, [paint("function")]),
  ),
  on(
    upper,
    byte(upper),
    bytes(union(upper, digit, "_"), { min: 0 }),
    notNext(rest),
    classify(table, [paint("constant.builtin")]),
  ),
  on(upper, ...ident, classify(table, [paint("type")])),
  on(start, ...ident, classify(table, [paint("variable")])),
  token("->", "operator"),
  token(":=", "operator"),
  ...["(", ")", "[", "]", "{", "}"].map((s) => token(s, "punctuation.bracket")),
  token(".", "punctuation.delimiter", pushState("member")),
  ...[",", ":", ";"].map((s) => token(s, "punctuation.delimiter")),
  ...["+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~", "\\"].map((s) =>
    token(s, "operator"),
  ),
];
export default defineGrammar<string>({
  name: "gdscript",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    member: {
      style: "plain",
      arms: [
        on(
          start,
          ...ident,
          lookahead(bytes(" \t", { min: 0 }), literal("(")),
          paint("function"),
          popState(),
        ),
        on(
          upper,
          byte(upper),
          bytes(union(upper, digit, "_"), { min: 0 }),
          notNext(rest),
          paint("constant.builtin"),
          popState(),
        ),
        on(upper, ...ident, paint("type"), popState()),
        on(start, ...ident, paint("property"), popState()),
      ],
      otherwise: [popState()],
    },
    functionName: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    className: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    ...Object.fromEntries(
      quoteStyles.flatMap(([quote, suffix]) => {
        return ["string", "raw"].map((kind) => [
          kind + suffix,
          {
            style: "string" as const,
            arms: [
              ...(kind === "raw"
                ? [on("\\", literal("\\"), byte(union("\\", quote[0]!)), paint("string"))]
                : [escape]),
              token(quote, "string", popState()),
              ...(quote.length === 1 ? [redispatch("\r\n", popState())] : []),
            ],
          },
        ]);
      }),
    ),
  },
});
