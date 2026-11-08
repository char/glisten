import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  keywordTable,
  literal,
  lookahead,
  on,
  oneOf,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  repeat,
  except,
  notNext,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const start = union("_$", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const comments = [
  token("//", "comment", pushState("lineComment")),
  on(
    "/",
    literal("/**"),
    notNext("/"),
    paint("comment"),
    pushState("docComment"),
    openInjection({ static: "jsdoc" }),
  ),
  token("/*", "comment", pushState("blockComment")),
];
const trivia = [on(" \t\r\n", bytes(" \t\r\n"), paint("plain")), ...comments];
const allBytes = byteSet({ ranges: [[0, 255]] });
const triviaMatch = repeat(
  choice(
    [bytes(" \t\r\n")],
    [literal("//"), bytes(except(allBytes, "\r\n"), { min: 0 })],
    [
      literal("/*"),
      repeat(choice([bytes(except(allBytes, "*"))], [literal("*"), notNext("/")])),
      literal("*/"),
    ],
  ),
);
const words = classify(
  [
    ...keywordTable(
      `
          keyof typeof infer extends in readonly is asserts as new abstract const unique
        `
        .trim()
        .split(/\s+/),
      "keyword",
    ),
    ...keywordTable(["true", "false", "null", "undefined"], "constant.builtin"),
  ],
  [paint("type")],
);

function typeExpression(context: "root" | "angle" | "paren" | "array" | "object" | "template") {
  const closing = {
    root: redispatch(";,)=]}", popState()),
    angle: token(">", "punctuation.bracket", popState()),
    paren: token(")", "punctuation.bracket", popState()),
    array: token("]", "punctuation.bracket", popState()),
    object: token("}", "punctuation.bracket", popState()),
    template: token("}", "punctuation.special", popState()),
  }[context];
  return [
    token("=>", "operator"),
    closing,
    ...comments,
    token('"', "string", pushState("double")),
    token("'", "string", pushState("single")),
    token("`", "string", pushState("tsTemplate")),
    ...(context === "object"
      ? [
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), optional(literal("?")), literal(":")),
            paint("property"),
          ),
        ]
      : []),
    on(start, ...ident, words),
    on(digit, bytes(union(digit, "_")), paint("number")),
    token("<", "punctuation.bracket", pushState("tsAngle")),
    token("(", "punctuation.bracket", pushState("tsTypeParenStart")),
    token("[", "punctuation.bracket", pushState("tsArrayStart")),
    token("{", "punctuation.bracket", pushState("tsObjectStart")),
    token(oneOf("|&?+-~="), "operator"),
    token(oneOf(",;:."), "punctuation.delimiter"),
  ];
}

function returnType(position: "start" | "after", kind: "ordinary" | "arrow") {
  const after = position === "after";
  const arrow = kind === "arrow";
  const before = arrow ? "tsArrowReturnStart" : "tsReturnStart";
  const completed = arrow ? "tsArrowReturnAfter" : "tsReturnAfter";
  const returnWords = classify(
    [
      ...keywordTable(
        `
          keyof typeof infer extends in readonly is asserts new abstract unique
        `
          .trim()
          .split(/\s+/),
        "keyword",
        () => [setState(before)],
      ),
      ...keywordTable(["true", "false", "null", "undefined"], "constant.builtin", () => [
        setState(completed),
      ]),
    ],
    [paint("type"), setState(completed)],
  );
  return [
    ...trivia,
    ...(arrow ? [] : [token("=>", "operator", setState(before))]),
    redispatch(after ? "{;,)=]}" : ";,)=]}", popState()),
    on(start, ...ident, returnWords),
    token('"', "string", setState(completed), pushState("double")),
    token("'", "string", setState(completed), pushState("single")),
    token("`", "string", setState(completed), pushState("tsTemplate")),
    token("<", "punctuation.bracket", setState(completed), pushState("tsAngle")),
    token("(", "punctuation.bracket", setState(completed), pushState("tsTypeParenStart")),
    token("[", "punctuation.bracket", setState(completed), pushState("tsArrayStart")),
    ...(!after
      ? [token("{", "punctuation.bracket", setState(completed), pushState("tsObjectStart"))]
      : []),
    token(oneOf("|&?:."), "operator", setState(before)),
  ];
}

export const typeStates = {
  tsType: { style: "plain" as const, arms: typeExpression("root") },
  tsAngle: { style: "plain" as const, arms: typeExpression("angle") },
  tsTypeParenStart: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("...", "operator"),
      on(
        start,
        ...ident,
        lookahead(triviaMatch, optional(literal("?"), triviaMatch), literal(":")),
        paint("variable"),
        setState("tsParen"),
      ),
    ],
    otherwise: [setState("tsParen")],
  },
  tsParen: {
    style: "plain" as const,
    arms: [
      token(",", "punctuation.delimiter", setState("tsTypeParenStart")),
      ...typeExpression("paren"),
    ],
  },
  tsArrayStart: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("...", "operator"),
      on(
        start,
        ...ident,
        lookahead(triviaMatch, optional(literal("?"), triviaMatch), literal(":")),
        paint("variable"),
        setState("tsArray"),
      ),
    ],
    otherwise: [setState("tsArray")],
  },
  tsArray: {
    style: "plain" as const,
    arms: [
      token(",", "punctuation.delimiter", setState("tsArrayStart")),
      ...typeExpression("array"),
    ],
  },
  tsObjectStart: {
    style: "plain" as const,
    arms: [
      ...trivia,
      on(
        start,
        ...ident,
        lookahead(triviaMatch, optional(literal("?"), triviaMatch), byte("(<")),
        classify(
          keywordTable(["new"], "keyword", () => [setState("tsObject")]),
          [paint("function"), setState("tsObject")],
        ),
      ),
    ],
    otherwise: [setState("tsObject")],
  },
  tsObject: {
    style: "plain" as const,
    arms: [
      token(oneOf(",;"), "punctuation.delimiter", setState("tsObjectStart")),
      ...typeExpression("object"),
    ],
  },
  tsTemplateType: { style: "plain" as const, arms: typeExpression("template") },
  tsTemplate: {
    style: "string" as const,
    arms: [
      on("\\", literal("\\"), character(), paint("string.escape")),
      token("${", "punctuation.special", pushState("tsTemplateType")),
      token("`", "string", popState()),
    ],
  },
  tsBinding: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("{", "punctuation.bracket", setState("tsBindingAfter"), pushState("objectHead")),
      token("[", "punctuation.bracket", setState("tsBindingAfter"), pushState("arrayValue")),
      on(start, ...ident, paint("variable"), setState("tsBindingAfter")),
    ],
    otherwise: [popState()],
  },
  tsBindingAfter: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token(":", "punctuation.delimiter", pushState("tsType")),
      token("!", "operator"),
      token("?", "operator"),
      token(",", "punctuation.delimiter", setState("tsBinding")),
    ],
    otherwise: [popState()],
  },
  tsAliasName: {
    style: "plain" as const,
    arms: [...trivia, on(start, ...ident, paint("type"), setState("tsAliasAfter"))],
    otherwise: [popState()],
  },
  tsAliasAfter: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("<", "punctuation.bracket", pushState("tsAngle")),
      token("=", "operator", setState("tsAliasDone"), pushState("tsType")),
    ],
    otherwise: [popState()],
  },
  tsAliasDone: { style: "plain" as const, arms: [], otherwise: [popState()] },
  tsClassName: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("{", "punctuation.bracket", setState("tsClassStart")),
      on(start, ...ident, paint("type"), setState("tsClassHead")),
    ],
    otherwise: [popState()],
  },
  tsClassHead: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("{", "punctuation.bracket", setState("tsClassStart")),
      token("<", "punctuation.bracket", pushState("tsAngle")),
      token(",", "punctuation.delimiter"),
      token(".", "punctuation.delimiter"),
      on(
        start,
        ...ident,
        classify(keywordTable(["extends", "implements"], "keyword"), [paint("type")]),
      ),
    ],
    otherwise: [popState()],
  },
  tsFunctionHead: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("*", "operator"),
      token("<", "punctuation.bracket", pushState("tsAngle")),
      on(start, ...ident, paint("function")),
      token("(", "punctuation.bracket", setState("tsFunctionAfter"), pushState("parenValue")),
    ],
    otherwise: [popState()],
  },
  tsFunctionAfter: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token(":", "punctuation.delimiter", setState("tsFunctionTail"), pushState("tsReturnStart")),
    ],
    otherwise: [popState()],
  },
  tsFunctionTail: { style: "plain" as const, arms: [], otherwise: [popState()] },
  tsAfterParen: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token(":", "punctuation.delimiter", popState(), pushState("tsArrowReturnStart")),
    ],
    otherwise: [popState()],
  },
  tsReturnStart: { style: "plain" as const, arms: returnType("start", "ordinary") },
  tsReturnAfter: { style: "plain" as const, arms: returnType("after", "ordinary") },
  tsArrowReturnStart: { style: "plain" as const, arms: returnType("start", "arrow") },
  tsArrowReturnAfter: { style: "plain" as const, arms: returnType("after", "arrow") },
  tsInterfaceName: {
    style: "plain" as const,
    arms: [...trivia, on(start, ...ident, paint("type"), setState("tsInterfaceHead"))],
    otherwise: [popState()],
  },
  tsInterfaceHead: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("{", "punctuation.bracket", setState("tsObjectStart")),
      token("<", "punctuation.bracket", pushState("tsAngle")),
      token(",", "punctuation.delimiter"),
      on(start, ...ident, words),
      token(".", "punctuation.delimiter"),
    ],
    otherwise: [popState()],
  },
  tsHeritage: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token("<", "punctuation.bracket", pushState("tsAngle")),
      token(",", "punctuation.delimiter"),
      token(".", "punctuation.delimiter"),
      on(start, ...ident, words),
    ],
    otherwise: [popState()],
  },
  tsDeclName: {
    style: "plain" as const,
    arms: [...trivia, on(start, ...ident, paint("type"), popState())],
    otherwise: [popState()],
  },
  tsNamespaceName: {
    style: "plain" as const,
    arms: [...trivia, on(start, ...ident, paint("type"), setState("tsNamespaceHead"))],
    otherwise: [popState()],
  },
  tsNamespaceHead: {
    style: "plain" as const,
    arms: [
      ...trivia,
      token(".", "punctuation.delimiter", setState("tsNamespaceName")),
      token("{", "punctuation.bracket", setState("braceStart")),
    ],
    otherwise: [popState()],
  },
};
