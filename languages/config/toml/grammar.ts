import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  defineGrammar,
  except,
  notNext,
  literal,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const bare = union(range("a", "z"), range("A", "Z"), digit, "_-");
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const unicodeHex = union(digit, range("a", "f"), range("A", "F"));
const valueTail = except(byteSet({ ranges: [[0, 255]] }), " \t\r\n,]}#");
const valueBefore = except(byteSet({ ranges: [[0, 255]] }), " \t\r\n[,{=");
const decimals = union(digit, "_");
const two = bytes(digit, { min: 2, max: 2 });
const time = [two, literal(":"), two, literal(":"), two, optional(literal("."), bytes(digit))];
const date = [bytes(digit, { min: 4, max: 4 }), literal("-"), two, literal("-"), two];
const comment = token("#", "comment", pushState("comment"));
const key = [
  on(bare, bytes(bare), paint("property")),
  token('"', "property", pushState("basicKey")),
  token("'", "property", pushState("literalKey")),
  token(".", "punctuation.delimiter"),
];
const value = (after: string) => [
  token('"""', "string", setState(after), pushState("multibasic")),
  token("'''", "string", setState(after), pushState("multiliteral")),
  token('"', "string", setState(after), pushState("basic")),
  token("'", "string", setState(after), pushState("literal")),
  token("[", "punctuation.bracket", setState(after), pushState("array")),
  token("{", "punctuation.bracket", setState(after), pushState("inlineKey")),
  ...["true", "false"].map((word) =>
    on(
      word[0]!,
      previousNotIn(valueBefore),
      literal(word),
      notNext(valueTail),
      paint("constant.builtin"),
      setState(after),
    ),
  ),
  on(
    "0123456789",
    ...date,
    optional(
      byte("Tt "),
      ...time,
      optional(choice([byte("Zz")], [byte("+-"), two, literal(":"), two])),
    ),
    paint("number"),
    setState(after),
  ),
  on("0123456789", ...time, paint("number"), setState(after)),
  on(
    "+-0123456789in",
    previousNotIn(valueBefore),
    optional(byte("+-")),
    choice(
      [literal("inf"), notNext(valueTail)],
      [literal("nan"), notNext(valueTail)],
      [literal("0x"), bytes(hex)],
      [literal("0o"), bytes("01234567_")],
      [literal("0b"), bytes("01_")],
      [
        bytes(decimals),
        optional(literal("."), bytes(decimals)),
        optional(byte("eE"), optional(byte("+-")), bytes(decimals)),
      ],
    ),
    paint("number"),
    setState(after),
  ),
];
const scalar16 = choice(
  [byte("0123456789aAbBcCeEfF"), bytes(unicodeHex, { min: 3, max: 3 })],
  [byte("dD"), byte("01234567"), bytes(unicodeHex, { min: 2, max: 2 })],
);
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u"), scalar16],
    [
      literal("U"),
      choice(
        [literal("0000"), scalar16],
        [literal("000"), byte("123456789aAbBcCdDeEfF"), bytes(unicodeHex, { min: 4, max: 4 })],
        [literal("0010"), bytes(unicodeHex, { min: 4, max: 4 })],
      ),
    ],
    [byte(`btnfr"\\`)],
  ),
  paint("string.escape"),
);

export default defineGrammar({
  name: "toml",
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        comment,
        token("[[", "punctuation.bracket", pushState("arrayHeader")),
        token("[", "punctuation.bracket", pushState("header")),
        ...key,
        token("=", "operator", setState("rootValue")),
      ],
    },
    header: {
      style: "plain",
      arms: [...key, token("]", "punctuation.bracket", popState()), redispatch("\n", popState())],
    },
    arrayHeader: {
      style: "plain",
      arms: [...key, token("]]", "punctuation.bracket", popState()), redispatch("\n", popState())],
    },
    rootValue: {
      style: "plain",
      arms: [comment, ...value("rootAfter"), token("\n", "plain", setState("root"))],
    },
    rootAfter: { style: "plain", arms: [comment, token("\n", "plain", setState("root"))] },
    array: {
      style: "plain",
      arms: [
        comment,
        token("]", "punctuation.bracket", popState()),
        token(",", "punctuation.delimiter"),
        ...value("array"),
      ],
    },
    inlineKey: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        ...key,
        token("=", "operator", setState("inlineValue")),
      ],
    },
    inlineValue: { style: "plain", arms: value("inlineAfter") },
    inlineAfter: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token(",", "punctuation.delimiter", setState("inlineKey")),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    basicKey: {
      style: "property",
      arms: [
        on("\\", literal("\\"), character(), paint("property")),
        token('"', "property", popState()),
        redispatch("\n", popState()),
      ],
    },
    literalKey: {
      style: "property",
      arms: [token("'", "property", popState()), redispatch("\n", popState())],
    },
    basic: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    literal: {
      style: "string",
      arms: [token("'", "string", popState()), redispatch("\n", popState())],
    },
    multibasic: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          optional(bytes(" \t")),
          choice([literal("\r\n")], [literal("\n")]),
          paint("string.escape"),
        ),
        escape,
        token('"""""', "string", popState()),
        token('""""', "string", popState()),
        token('"""', "string", popState()),
      ],
    },
    multiliteral: {
      style: "string",
      arms: [
        token("'''''", "string", popState()),
        token("''''", "string", popState()),
        token("'''", "string", popState()),
      ],
    },
  },
});
