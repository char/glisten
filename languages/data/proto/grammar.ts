import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
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
const types = `
  double float int32 int64 uint32 uint64 sint32 sint64 fixed32 fixed64 sfixed32 sfixed64 bool
  string bytes
`
  .trim()
  .split(/\s+/);
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte("abfnrtv\\\"'?")],
    [byte("xX"), bytes(hex, { min: 1, max: 2 })],
    [bytes("01234567", { min: 1, max: 3 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U000"), bytes(hex, { min: 5, max: 5 })],
    [literal("U0010"), bytes(hex, { min: 4, max: 4 })],
  ),
  paint("string.escape"),
);
const exponent = [byte("eE"), optional(byte("+-")), bytes(digit)];
const number = (finish = false) =>
  on(
    digit,
    previousNotIn(rest),
    choice(
      [literal("0"), byte("xX"), bytes(hex)],
      [bytes(digit), literal("."), bytes(digit, { min: 0 }), optional(...exponent)],
      [bytes(digit), ...exponent],
      [literal("0"), bytes("01234567", { min: 0 })],
      [byte(range("1", "9")), bytes(digit, { min: 0 })],
    ),
    notNext(rest),
    paint("number"),
    ...(finish ? [popState()] : []),
  );
const leadingFraction = (finish = false) =>
  on(
    ".",
    literal("."),
    bytes(digit),
    optional(...exponent),
    notNext(rest),
    paint("number"),
    ...(finish ? [popState()] : []),
  );
const trivia = [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const aggregateTrivia = [...trivia, token("#", "comment", pushState("lineComment"))];
const strings = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
const scalar = [
  ...strings,
  number(),
  leadingFraction(),
  on(
    start,
    ...ident,
    classify(
      [
        ...keywordTable(["true", "false"], "constant.builtin"),
        ...keywordTable(["inf", "nan"], "number"),
      ],
      [paint("constant.builtin")],
    ),
  ),
  token(oneOf("+-"), "operator"),
  token(".", "punctuation.delimiter"),
];
const optionValue = [
  ...scalar,
  token("{", "punctuation.bracket", pushState("aggregate")),
  token("<", "punctuation.bracket", pushState("aggregateAngle")),
  token("[", "punctuation.bracket", pushState("list")),
];
const statements = [
  { text: "syntax", then: [paint("keyword"), pushState("statement")] },
  { text: "edition", then: [paint("keyword"), pushState("statement")] },
  { text: "import", then: [paint("keyword"), pushState("importStatement")] },
  { text: "package", then: [paint("keyword"), pushState("statement")] },
  { text: "option", then: [paint("keyword"), pushState("optionName")] },
  { text: "reserved", then: [paint("keyword"), pushState("rangeStatement")] },
  { text: "extensions", then: [paint("keyword"), pushState("rangeStatement")] },
];
const declarations = [
  { text: "message", then: [paint("keyword"), pushState("messageName")] },
  { text: "enum", then: [paint("keyword"), pushState("enumName")] },
  { text: "service", then: [paint("keyword"), pushState("serviceName")] },
  { text: "oneof", then: [paint("keyword"), pushState("messageName")] },
  { text: "extend", then: [paint("keyword"), pushState("extendName")] },
];
const punctuation = [
  token(oneOf(";,:"), "punctuation.delimiter"),
  token(oneOf("()[]{}<>"), "punctuation.bracket"),
  token("=", "operator"),
];

export default defineGrammar({
  name: "proto",
  aliases: ["protobuf"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...ident, classify([...statements, ...declarations], [paint("plain")])),
        ...punctuation,
      ],
    },
    messageBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        on(
          start,
          ...ident,
          classify(
            [
              ...statements,
              ...declarations,
              ...keywordTable(["optional", "required", "repeated"], "keyword"),
              { text: "map", then: [paint("keyword"), pushState("mapOpen")] },
              // Proto2 groups carry a field name before their number and body.
              { text: "group", then: [paint("keyword"), pushState("groupName")] },
              ...types.map((text) => ({ text, then: [paint("type"), pushState("fieldName")] })),
            ],
            [paint("type"), pushState("fieldTypeTail")],
          ),
        ),
        token(".", "punctuation.delimiter", pushState("qualifiedType")),
        ...punctuation,
      ],
    },
    enumBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        on(
          start,
          ...ident,
          classify(statements, [paint("constant.builtin"), pushState("fieldAfterName")]),
        ),
        ...punctuation,
      ],
    },
    serviceBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        on(
          start,
          ...ident,
          classify(
            [...statements, { text: "rpc", then: [paint("keyword"), pushState("rpcName")] }],
            [paint("plain")],
          ),
        ),
        ...punctuation,
      ],
    },
    messageName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("type"), setState("messageOpen"))],
      otherwise: [popState()],
    },
    enumName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("type"), setState("enumOpen"))],
      otherwise: [popState()],
    },
    serviceName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("type"), setState("serviceOpen"))],
      otherwise: [popState()],
    },
    extendName: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...ident, paint("type")),
        token(".", "punctuation.delimiter"),
        token("{", "punctuation.bracket", setState("messageBody")),
      ],
      otherwise: [popState()],
    },
    messageOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("messageBody"))],
      otherwise: [popState()],
    },
    enumOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("enumBody"))],
      otherwise: [popState()],
    },
    serviceOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("serviceBody"))],
      otherwise: [popState()],
    },
    qualifiedType: {
      style: "plain",
      arms: [on(start, ...ident, paint("type"), setState("fieldTypeTail"))],
      otherwise: [popState()],
    },
    fieldTypeTail: {
      style: "plain",
      arms: [
        ...trivia,
        token(".", "punctuation.delimiter", setState("qualifiedType")),
        on(start, ...ident, paint("property"), setState("fieldAfterName")),
      ],
      otherwise: [popState()],
    },
    fieldName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("property"), setState("fieldAfterName"))],
      otherwise: [popState()],
    },
    groupName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("type"), setState("groupAfterName"))],
      otherwise: [popState()],
    },
    groupAfterName: {
      style: "plain",
      arms: [
        ...trivia,
        number(),
        token("=", "operator"),
        token("[", "punctuation.bracket", pushState("fieldOptions")),
        token("{", "punctuation.bracket", setState("messageBody")),
      ],
      otherwise: [popState()],
    },
    fieldAfterName: {
      style: "plain",
      arms: [
        ...trivia,
        ...strings,
        number(),
        token("=", "operator"),
        token(oneOf("+-"), "operator"),
        token("[", "punctuation.bracket", pushState("fieldOptions")),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    mapOpen: {
      style: "plain",
      arms: [...trivia, token("<", "punctuation.bracket", setState("mapTypes"))],
      otherwise: [popState()],
    },
    mapTypes: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...ident, paint("type")),
        token(".", "punctuation.delimiter"),
        token(",", "punctuation.delimiter"),
        token(">", "punctuation.bracket", setState("fieldName")),
      ],
      otherwise: [popState()],
    },
    rpcName: {
      style: "plain",
      arms: [...trivia, on(start, ...ident, paint("function"), setState("rpcHead"))],
      otherwise: [popState()],
    },
    rpcHead: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          start,
          ...ident,
          classify(keywordTable(["stream", "returns"], "keyword"), [paint("type")]),
        ),
        token(".", "punctuation.delimiter"),
        token(oneOf("()"), "punctuation.bracket"),
        token(";", "punctuation.delimiter", popState()),
        token("{", "punctuation.bracket", setState("rpcBody")),
      ],
      otherwise: [popState()],
    },
    rpcBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        on(start, ...ident, classify(statements, [paint("plain")])),
        token(";", "punctuation.delimiter"),
      ],
      otherwise: [popState()],
    },
    statement: {
      style: "plain",
      arms: [
        ...trivia,
        ...strings,
        number(),
        leadingFraction(),
        on(start, ...ident, paint("plain")),
        token(oneOf("=+-"), "operator"),
        token(oneOf(",."), "punctuation.delimiter"),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    importStatement: {
      style: "plain",
      arms: [
        ...trivia,
        ...strings,
        on(
          start,
          ...ident,
          classify(keywordTable(["public", "weak", "option"], "keyword"), [paint("plain")]),
        ),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    rangeStatement: {
      style: "plain",
      arms: [
        ...trivia,
        ...strings,
        number(),
        on(start, ...ident, classify(keywordTable(["to", "max"], "keyword"), [paint("plain")])),
        token(oneOf("+-"), "operator"),
        token(",", "punctuation.delimiter"),
        token("[", "punctuation.bracket", pushState("fieldOptions")),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    optionName: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...ident, paint("property")),
        token(oneOf("()"), "punctuation.bracket"),
        token(".", "punctuation.delimiter"),
        token("=", "operator", setState("optionValue")),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    optionValue: {
      style: "plain",
      arms: [...trivia, ...optionValue, token(";", "punctuation.delimiter", popState())],
      otherwise: [popState()],
    },
    fieldOptions: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...ident, paint("property")),
        token(oneOf("()"), "punctuation.bracket"),
        token(".", "punctuation.delimiter"),
        token("=", "operator", pushState("fieldOptionValue")),
        token(",", "punctuation.delimiter"),
        token("]", "punctuation.bracket", popState()),
      ],
      otherwise: [popState()],
    },
    fieldOptionValue: {
      style: "plain",
      arms: [...trivia, ...optionValue, redispatch(",]", popState())],
      otherwise: [popState()],
    },
    // Aggregate option values use text-format message syntax. Extension and Any
    // names are painted as properties component by component.
    aggregate: {
      style: "plain",
      arms: [
        ...aggregateTrivia,
        token("}", "punctuation.bracket", popState()),
        on(start, ...ident, paint("property")),
        token(":", "punctuation.delimiter", pushState("aggregateValue")),
        token("{", "punctuation.bracket", pushState("aggregate")),
        token("<", "punctuation.bracket", pushState("aggregateAngle")),
        token(oneOf(",;./"), "punctuation.delimiter"),
        token(oneOf("[]"), "punctuation.bracket"),
      ],
      otherwise: [popState()],
    },
    aggregateAngle: {
      style: "plain",
      arms: [
        ...aggregateTrivia,
        token(">", "punctuation.bracket", popState()),
        on(start, ...ident, paint("property")),
        token(":", "punctuation.delimiter", pushState("aggregateValue")),
        token("{", "punctuation.bracket", pushState("aggregate")),
        token("<", "punctuation.bracket", pushState("aggregateAngle")),
        token(oneOf(",;./"), "punctuation.delimiter"),
        token(oneOf("[]"), "punctuation.bracket"),
      ],
      otherwise: [popState()],
    },
    aggregateValue: {
      style: "plain",
      arms: [
        ...aggregateTrivia,
        token('"', "string", setState("aggregateString"), pushState("doubleString")),
        token("'", "string", setState("aggregateString"), pushState("singleString")),
        token("{", "punctuation.bracket", popState(), pushState("aggregate")),
        token("<", "punctuation.bracket", popState(), pushState("aggregateAngle")),
        token("[", "punctuation.bracket", popState(), pushState("list")),
        on(
          start,
          ...ident,
          classify(
            ["inf", "nan"].map((text) => ({ text, then: [paint("number"), popState()] })),
            [paint("constant.builtin"), popState()],
          ),
        ),
        token(oneOf("+-"), "operator"),
        number(true),
        leadingFraction(true),
      ],
      otherwise: [popState()],
    },
    aggregateString: {
      style: "plain",
      arms: [...aggregateTrivia, ...strings],
      otherwise: [popState()],
    },
    list: {
      style: "plain",
      arms: [
        ...aggregateTrivia,
        token("]", "punctuation.bracket", popState()),
        ...optionValue,
        token(",", "punctuation.delimiter"),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
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
