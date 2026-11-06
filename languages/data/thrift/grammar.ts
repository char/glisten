import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  on,
  oneOf,
  notNext,
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
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const identifier = [
  byte(start),
  bytes(rest, { min: 0 }),
  repeat(literal("."), byte(rest), bytes(rest, { min: 0 })),
];
const trivia = [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  token("//", "comment", pushState("lineComment")),
  token("#", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const escape = on("\\", literal("\\"), byte("rnt\"'\\"), paint("string.escape"));
const exponent = [byte("eE"), optional(byte("+-")), bytes(digit)];
const numeric = [
  optional(byte("+-")),
  choice(
    [literal("0x"), bytes(hex)],
    [bytes(digit, { min: 0 }), literal("."), bytes(digit), optional(...exponent)],
    [bytes(digit), ...exponent],
    [bytes(digit)],
  ),
];
const annotation = token("(", "punctuation.bracket", pushState("annotations"));
const fbAnnotation = token("@", "attribute", pushState("fbAnnotationName"));
const number = on("+-.0123456789", ...numeric, paint("number"));
const string = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
const keywords = [
  "include",
  "cpp_include",
  "cpp_type",
  "package",
  "safe",
  "server",
  "client",
  "transient",
  "permanent",
  "stateful",
  "xsd_all",
  "xsd_optional",
  "xsd_nillable",
  "xsd_attrs",
];
const containers = ["map", "list", "set", "stream", "sink"];
const fieldTypeCases = [
  ...keywordTable(["required", "optional"], "keyword"),
  ...containers.map((text) => ({
    text,
    then: [paint("type"), setState("fieldTypeSuffix"), pushState("containerArgsOpen")],
  })),
];

export default defineGrammar({
  name: "thrift",
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...trivia,
        fbAnnotation,
        ...string,
        number,
        on(
          start,
          ...identifier,
          classify(
            [
              ...["struct", "union", "exception"].map((text) => ({
                text,
                then: [paint("keyword"), pushState("structName")],
              })),
              ...["enum", "senum"].map((text) => ({
                text,
                then: [paint("keyword"), pushState("enumName")],
              })),
              ...["service", "interaction"].map((text) => ({
                text,
                then: [paint("keyword"), pushState("serviceName")],
              })),
              { text: "namespace", then: [paint("keyword"), pushState("namespaceScope")] },
              {
                text: "typedef",
                then: [paint("keyword"), pushState("typedefName"), pushState("type")],
              },
              {
                text: "const",
                then: [paint("keyword"), pushState("constName"), pushState("type")],
              },
              ...keywordTable(keywords, "keyword"),
            ],
            [paint("plain")],
          ),
        ),
        token(oneOf("{}[]()<>"), "punctuation.bracket"),
        token(oneOf(",;:."), "punctuation.delimiter"),
        token(oneOf("=&"), "operator"),
        token("*", "punctuation.special"),
      ],
    },
    namespaceScope: {
      style: "plain",
      arms: [
        ...trivia,
        on(start, ...identifier, paint("plain"), setState("namespaceName")),
        token("*", "punctuation.special", setState("namespaceName")),
      ],
      otherwise: [popState()],
    },
    namespaceName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("plain"), setState("afterDefinition"))],
      otherwise: [popState()],
    },
    structName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("type"), setState("structOpen"))],
      otherwise: [popState()],
    },
    structOpen: {
      style: "plain",
      arms: [
        ...trivia,
        on("x", literal("xsd_all"), notNext(rest), paint("keyword")),
        token("{", "punctuation.bracket", setState("fields")),
      ],
      otherwise: [popState()],
    },
    enumName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("type"), setState("enumOpen"))],
      otherwise: [popState()],
    },
    enumOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("enumBody"))],
      otherwise: [popState()],
    },
    serviceName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("type"), setState("serviceOpen"))],
      otherwise: [popState()],
    },
    serviceOpen: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          start,
          ...identifier,
          classify(
            [{ text: "extends", then: [paint("keyword"), pushState("baseName")] }],
            [paint("plain")],
          ),
        ),
        token("{", "punctuation.bracket", setState("serviceBody")),
      ],
      otherwise: [popState()],
    },
    baseName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("type"), popState())],
      otherwise: [popState()],
    },
    fields: {
      style: "plain",
      arms: [
        ...trivia,
        fbAnnotation,
        token("}", "punctuation.bracket", setState("afterDefinition")),
        token(oneOf(",;"), "punctuation.delimiter"),
        redispatch(union(start, "+-0123456789"), pushState("fieldStart")),
      ],
    },
    parameters: {
      style: "plain",
      arms: [
        ...trivia,
        fbAnnotation,
        token(")", "punctuation.bracket", popState()),
        token(oneOf(",;"), "punctuation.delimiter"),
        redispatch(union(start, "+-0123456789"), pushState("fieldStart")),
      ],
    },
    fieldStart: {
      style: "plain",
      arms: [
        ...trivia,
        on("+-0123456789", ...numeric, paint("number"), setState("fieldColon")),
        on(
          start,
          ...identifier,
          classify(fieldTypeCases, [paint("type"), setState("fieldTypeSuffix")]),
        ),
      ],
      otherwise: [popState()],
    },
    fieldColon: {
      style: "plain",
      arms: [...trivia, token(":", "punctuation.delimiter", setState("fieldRequired"))],
      otherwise: [popState()],
    },
    fieldRequired: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          start,
          ...identifier,
          classify(fieldTypeCases, [paint("type"), setState("fieldTypeSuffix")]),
        ),
      ],
      otherwise: [popState()],
    },
    // A field's first type token is already consumed; container arguments use the same type parser as typedefs and functions.
    fieldTypeSuffix: {
      style: "plain",
      arms: [
        ...trivia,
        token("<", "punctuation.bracket", pushState("typeArguments")),
        annotation,
        on("c", literal("cpp_type"), notNext(rest), paint("keyword"), pushState("cppTypeString")),
        token("&", "operator"),
        on(start, ...identifier, paint("variable.member"), setState("fieldTail")),
      ],
      otherwise: [popState()],
    },
    fieldTail: {
      style: "plain",
      arms: [
        ...trivia,
        annotation,
        token("=", "operator", pushState("value")),
        token(oneOf(",;"), "punctuation.delimiter", popState()),
        on("x", literal("xsd_attrs"), notNext(rest), paint("keyword"), pushState("xsdOpen")),
        ...["xsd_optional", "xsd_nillable"].map((word) =>
          on(word[0]!, literal(word), notNext(rest), paint("keyword")),
        ),
      ],
      otherwise: [popState()],
    },
    xsdOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("fields"))],
      otherwise: [popState()],
    },
    type: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          start,
          ...identifier,
          classify(
            containers.map((text) => ({ text, then: [paint("type"), setState("containerOpen")] })),
            [paint("type"), setState("typeSuffix")],
          ),
        ),
      ],
      otherwise: [popState()],
    },
    containerOpen: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          start,
          ...identifier,
          classify([{ text: "cpp_type", then: [paint("keyword")] }], [paint("plain")]),
        ),
        ...string,
        token("<", "punctuation.bracket", setState("typeSuffix"), pushState("typeArguments")),
      ],
      otherwise: [popState()],
    },
    containerArgsOpen: {
      style: "plain",
      arms: [
        ...trivia,
        on("c", literal("cpp_type"), notNext(rest), paint("keyword"), pushState("cppTypeString")),
        token("<", "punctuation.bracket", setState("typeArguments")),
      ],
      otherwise: [popState()],
    },
    cppTypeString: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", setState("valueEnd"), pushState("doubleString")),
        token("'", "string", setState("valueEnd"), pushState("singleString")),
      ],
      otherwise: [popState()],
    },
    typeArguments: {
      style: "plain",
      arms: [
        ...trivia,
        token(">", "punctuation.bracket", popState()),
        token(",", "punctuation.delimiter"),
        redispatch(start, pushState("type")),
      ],
      otherwise: [popState()],
    },
    typeSuffix: {
      style: "plain",
      arms: [
        ...trivia,
        annotation,
        on("c", literal("cpp_type"), notNext(rest), paint("keyword"), pushState("cppTypeString")),
        on("t", literal("throws"), notNext(rest), paint("keyword"), pushState("throwsOpen")),
      ],
      otherwise: [popState()],
    },
    typedefName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("type"), setState("afterDefinition"))],
      otherwise: [popState()],
    },
    constName: {
      style: "plain",
      arms: [...trivia, on(start, ...identifier, paint("constant.builtin"), setState("constTail"))],
      otherwise: [popState()],
    },
    constTail: {
      style: "plain",
      arms: [...trivia, token("=", "operator", setState("afterDefinition"), pushState("value"))],
      otherwise: [popState()],
    },
    afterDefinition: {
      style: "plain",
      arms: [...trivia, annotation, token(oneOf(",;"), "punctuation.delimiter", popState())],
      otherwise: [popState()],
    },
    enumBody: {
      style: "plain",
      arms: [
        ...trivia,
        fbAnnotation,
        token("}", "punctuation.bracket", setState("afterDefinition")),
        token(oneOf(",;"), "punctuation.delimiter"),
        on(start, ...identifier, paint("constant.builtin"), pushState("enumTail")),
        token('"', "string", pushState("enumTail"), pushState("doubleString")),
        token("'", "string", pushState("enumTail"), pushState("singleString")),
      ],
    },
    enumTail: {
      style: "plain",
      arms: [
        ...trivia,
        annotation,
        token("=", "operator", pushState("value")),
        token(oneOf(",;"), "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    serviceBody: {
      style: "plain",
      arms: [
        ...trivia,
        fbAnnotation,
        token("}", "punctuation.bracket", setState("afterDefinition")),
        token(oneOf(",;"), "punctuation.delimiter"),
        on(
          start,
          ...identifier,
          classify(
            [
              ...keywordTable(["oneway", "async", "readonly", "idempotent"], "keyword"),
              { text: "performs", then: [paint("keyword"), pushState("baseName")] },
              ...containers.map((text) => ({
                text,
                then: [
                  paint("type"),
                  pushState("functionTypeSuffix"),
                  pushState("containerArgsOpen"),
                ],
              })),
            ],
            [paint("type"), pushState("functionTypeSuffix")],
          ),
        ),
      ],
    },
    functionTypeSuffix: {
      style: "plain",
      arms: [
        ...trivia,
        token("<", "punctuation.bracket", pushState("typeArguments")),
        annotation,
        on("c", literal("cpp_type"), notNext(rest), paint("keyword"), pushState("cppTypeString")),
        on(start, ...identifier, paint("function"), setState("functionOpen")),
      ],
      otherwise: [popState()],
    },
    functionOpen: {
      style: "plain",
      arms: [
        ...trivia,
        token("(", "punctuation.bracket", setState("functionTail"), pushState("parameters")),
      ],
      otherwise: [popState()],
    },
    functionTail: {
      style: "plain",
      arms: [
        ...trivia,
        annotation,
        on(
          "t",
          literal("throws"),
          notNext(union(rest, ".")),
          paint("keyword"),
          pushState("throwsOpen"),
        ),
        token(oneOf(",;"), "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    throwsOpen: {
      style: "plain",
      arms: [...trivia, token("(", "punctuation.bracket", setState("parameters"))],
      otherwise: [popState()],
    },
    annotations: {
      style: "plain",
      arms: [
        ...trivia,
        token(")", "punctuation.bracket", popState()),
        token(oneOf(",;"), "punctuation.delimiter"),
        on(start, ...identifier, paint("attribute")),
        token("=", "operator", pushState("value")),
      ],
      otherwise: [popState()],
    },
    fbAnnotationName: {
      style: "plain",
      arms: [on(start, ...identifier, paint("attribute"), setState("fbAnnotationTail"))],
      otherwise: [popState()],
    },
    fbAnnotationTail: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("fbFields"))],
      otherwise: [popState()],
    },
    fbFields: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        token(oneOf(",;"), "punctuation.delimiter"),
        on(start, ...identifier, paint("attribute")),
        token("=", "operator", pushState("value")),
      ],
      otherwise: [popState()],
    },
    value: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", setState("valueEnd"), pushState("doubleString")),
        token("'", "string", setState("valueEnd"), pushState("singleString")),
        on("+-.0123456789", ...numeric, paint("number"), popState()),
        on(start, ...identifier, paint("constant.builtin"), setState("valueAfterIdentifier")),
        token("[", "punctuation.bracket", setState("listValue")),
        token("{", "punctuation.bracket", setState("aggregate")),
      ],
      otherwise: [popState()],
    },
    valueAfterIdentifier: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("fbFields"))],
      otherwise: [popState()],
    },
    valueEnd: { style: "plain", arms: [], otherwise: [popState()] },
    listValue: {
      style: "plain",
      arms: [
        ...trivia,
        token("]", "punctuation.bracket", popState()),
        token(oneOf(",;"), "punctuation.delimiter"),
        redispatch(union(start, "\"'+-.0123456789[{"), pushState("value")),
      ],
      otherwise: [popState()],
    },
    aggregate: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        token(oneOf(",;:"), "punctuation.delimiter"),
        redispatch(union(start, "\"'+-.0123456789[{"), pushState("value")),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    // Apache rejects newline in strings; fbthrift multiline strings recover here at newline too.
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
