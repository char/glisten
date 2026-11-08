import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  literal,
  notNext,
  on,
  oneOf,
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
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const decimal = choice([literal("0")], [byte(range("1", "9")), bytes(digit, { min: 0 })]);
const exponent = [byte("eE"), optional(byte("+-")), bytes(digit)];
const number = (finish = false) =>
  on(
    union(digit, "."),
    previousNotIn(rest),
    choice(
      [literal("0"), byte("xX"), bytes(hex)],
      [literal("."), bytes(digit), optional(...exponent), optional(byte("fF"))],
      [
        decimal,
        literal("."),
        bytes(digit, { min: 0 }),
        optional(...exponent),
        optional(byte("fF")),
      ],
      [decimal, ...exponent, optional(byte("fF"))],
      [decimal, byte("fF")],
      [literal("0"), bytes("01234567")],
      [decimal],
    ),
    notNext(rest),
    paint("number"),
    ...(finish ? [popState()] : []),
  );
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte("abfnrtv?\\\"'")],
    [literal("x"), bytes(hex, { min: 1, max: 2 })],
    [bytes("01234567", { min: 1, max: 3 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U000"), bytes(hex, { min: 5, max: 5 })],
    [literal("U0010"), bytes(hex, { min: 4, max: 4 })],
  ),
  paint("string.escape"),
);
const trivia = [
  on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
  token("#", "comment", pushState("comment")),
];
const strings = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
type ValueContext = "list" | "field";
const valueWord = (context: ValueContext = "list") =>
  on(
    start,
    ...ident,
    // Without a schema, enum names can also spell boolean or special float values.
    classify(
      ["inf", "infinity", "nan"].map((text) => ({
        text,
        then: [paint("number"), ...(context === "field" ? [popState()] : [])],
      })),
      [paint("constant.builtin"), ...(context === "field" ? [popState()] : [])],
      { caseless: true },
    ),
  );

const fieldArms = [
  on(start, ...ident, paint("property"), pushState("afterName")),
  token("[", "punctuation.bracket", pushState("extensionName")),
  token(oneOf(",;"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "textproto",
  aliases: ["pbtxt", "txtpb", "textpb"],
  initial: "root",
  states: {
    root: { style: "plain", arms: [...trivia, ...fieldArms] },
    body: {
      style: "plain",
      arms: [...trivia, token("}", "punctuation.bracket", popState()), ...fieldArms],
    },
    angleBody: {
      style: "plain",
      arms: [...trivia, token(">", "punctuation.bracket", popState()), ...fieldArms],
    },
    // Highlight URL and type-name components without validating percent escapes or name syntax.
    extensionName: {
      style: "plain",
      arms: [
        ...trivia,
        token("]", "punctuation.bracket", setState("afterName")),
        on(start, ...ident, paint("property")),
        on(digit, bytes(digit), paint("property")),
        token(oneOf("./"), "punctuation.delimiter"),
        token(oneOf("-~!$&()*+,;=%"), "property"),
      ],
      otherwise: [popState()],
    },
    afterName: {
      style: "plain",
      arms: [
        ...trivia,
        token(":", "punctuation.delimiter", setState("value")),
        token("{", "punctuation.bracket", setState("body")),
        token("<", "punctuation.bracket", setState("angleBody")),
        token("[", "punctuation.bracket", setState("list")),
      ],
      otherwise: [popState()],
    },
    value: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", setState("stringSequence"), pushState("doubleString")),
        token("'", "string", setState("stringSequence"), pushState("singleString")),
        token("{", "punctuation.bracket", setState("body")),
        token("<", "punctuation.bracket", setState("angleBody")),
        token("[", "punctuation.bracket", setState("list")),
        token("-", "operator"),
        number(true),
        valueWord("field"),
      ],
      otherwise: [popState()],
    },
    stringSequence: { style: "plain", arms: [...trivia, ...strings], otherwise: [popState()] },
    list: {
      style: "plain",
      arms: [
        ...trivia,
        token("]", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("body")),
        token("<", "punctuation.bracket", pushState("angleBody")),
        ...strings,
        token(",", "punctuation.delimiter"),
        token("-", "operator"),
        number(),
        valueWord(),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    doubleString: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    singleString: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\n", popState())],
    },
  },
});
