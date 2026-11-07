import {
  abandon,
  baseState,
  byte,
  bytes,
  byteSet,
  choice,
  except as exceptBytes,
  lineEnd,
  literal,
  lookahead,
  repeat,
  matchRun,
  notLookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  range,
  redispatch,
  saveRun,
  setState,
  slot,
  speculate,
  token,
  union,
} from "#/grammar/mod.ts";

const inlineCodeRunSlot = slot.run("inline.code");

const alpha = union(range("a", "z"), range("A", "Z"));
const alphanumeric = union(range("a", "z"), range("A", "Z"), range("0", "9"));
const digit = range("0", "9");
const scheme = union("+-.", range("a", "z"), range("A", "Z"), range("0", "9"));
const localPart = union("!#$%&'*+-/=?^_`{|}~.", range("a", "z"), range("A", "Z"), range("0", "9"));
const domain = union("-", range("a", "z"), range("A", "Z"), range("0", "9"));
const domainLabel = [
  byte(alphanumeric),
  bytes(domain, { min: 0, max: 62 }),
  previousNotIn("-"),
] as const;
const uriBody = union(
  range("!", ";"),
  range("=", "="),
  range("?", "~"),
  byteSet({ ranges: [[128, 255]] }),
);
const htmlName = union("-", range("a", "z"), range("A", "Z"), range("0", "9"));
const attributeStart = union("_:", range("a", "z"), range("A", "Z"));
const attributeRest = union("_:.-", range("a", "z"), range("A", "Z"), range("0", "9"));
const allBytes = byteSet({ ranges: [[0, 255]] });
const except = (excluded: string) => exceptBytes(allBytes, excluded);
const urlText = except(" \t\n\r<>.,!?;:()]}*_~");
const urlParenthesis = except(" \t\n\r<>()");
const attributeValue = choice(
  [literal('"'), bytes(except('"\n\r'), { min: 0 }), literal('"')],
  [literal("'"), bytes(except("'\n\r"), { min: 0 }), literal("'")],
  [bytes(except(" \t\n\r\"'=<>`"))],
);
const htmlTag = on(
  "<",
  literal("<"),
  choice(
    [literal("/"), byte(alpha), bytes(htmlName, { min: 0 }), optional(bytes(" \t"))],
    [
      byte(alpha),
      bytes(htmlName, { min: 0 }),
      repeat(
        bytes(" \t"),
        byte(attributeStart),
        bytes(attributeRest, { min: 0 }),
        optional(optional(bytes(" \t")), literal("="), optional(bytes(" \t")), attributeValue),
      ),
      optional(bytes(" \t")),
      optional(literal("/")),
    ],
  ),
  literal(">"),
  paint("punctuation.special"),
);
const hex = union(range("0", "9"), range("a", "f"), range("A", "F"));

const inlineSpeculate = (state: string) =>
  speculate(state, "inline", { base: "headerStart", group: "headerInline" });

export const commentOpener = (state: string) => token("<!--", "comment", inlineSpeculate(state));
export const commentCloser = token("-->", "comment", popState());

export const codeSpanOpener = (state: string) =>
  on(
    "`",
    previousNotIn("`"),
    bytes("`"),
    saveRun(inlineCodeRunSlot),
    paint("text.literal"),
    inlineSpeculate(state),
  );

export const codeSpanCloser = on(
  "`",
  previousNotIn("`"),
  matchRun(inlineCodeRunSlot, { relation: "exact" }),
  paint("text.literal"),
  popState(),
);

const linkLabel = repeat(choice([literal("\\"), byte(except("\n\r"))], [bytes(except("\\]\n\r"))]));
export const linkOpeners = [
  token("![", "text.reference", inlineSpeculate("linkText")),
  token("[", "text.reference", inlineSpeculate("linkText")),
  on(
    "!",
    literal("!["),
    linkLabel,
    literal("]"),
    lookahead(literal("("), bytes(except(")\n\r"), { min: 0 }), optional(literal("\r")), lineEnd()),
    paint("text.reference"),
  ),
  on(
    "[",
    literal("["),
    linkLabel,
    literal("]"),
    lookahead(literal("("), bytes(except(")\n\r"), { min: 0 }), optional(literal("\r")), lineEnd()),
    paint("text.reference"),
  ),
];

const whitespace = " \t\n\r\f\v";
const punctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const ordinary = except(whitespace + punctuation);
const emphasisOpener = (
  delimiter: string,
  state: string,
  style: "text.emphasis" | "text.strong" | "text.strikethrough",
) =>
  on(
    delimiter[0]!,
    previousNotIn(delimiter[0]!),
    ...(delimiter[0] === "_" ? [previousNotIn(alphanumeric)] : []),
    choice([lookahead(literal(delimiter), notNext(punctuation))], [previousNotIn(ordinary)]),
    literal(delimiter),
    notNext(delimiter[0]!),
    lookahead(byte(except(whitespace))),
    paint(style),
    style === "text.strikethrough"
      ? speculate(state, "strike", { base: "headerStart", group: "headerStrike" })
      : inlineSpeculate(state),
  );

export const emphasisOpeners = [
  emphasisOpener("~~", "strikeDouble", "text.strikethrough"),
  emphasisOpener("~", "strikeSingle", "text.strikethrough"),
  emphasisOpener("***", "tripleStar", "text.strong"),
  emphasisOpener("___", "tripleUnderscore", "text.strong"),
  emphasisOpener("**", "strongStar", "text.strong"),
  emphasisOpener("__", "strongUnderscore", "text.strong"),
  emphasisOpener("*", "emphasisStar", "text.emphasis"),
  emphasisOpener("_", "emphasisUnderscore", "text.emphasis"),
];

export function emphasisState(
  delimiter: string,
  style: "text.emphasis" | "text.strong" | "text.strikethrough",
) {
  return {
    style,
    arms: [
      on(
        delimiter[0]!,
        previousNotIn(whitespace + (delimiter[0] === "~" ? "~" : "")),
        choice(
          [
            previousNotIn(punctuation),
            literal(delimiter),
            ...(delimiter[0] === "_" ? [notNext(alphanumeric)] : []),
          ],
          [
            literal(delimiter),
            ...(delimiter[0] === "_" ? [notNext(alphanumeric)] : []),
            lookahead(choice([byte(whitespace + punctuation)], [lineEnd()])),
          ],
        ),
        ...(delimiter[0] === "~" ? [notNext("~")] : []),
        paint(style),
        popState(),
      ),
      ...inlineAtoms,
      ...emphasisOpeners,
      ...linkOpeners,
      codeSpanOpener("codeParagraph"),
      commentOpener("commentParagraph"),
      redispatch("\n", notLookahead(baseState("paragraph", "headerStart")), abandon()),
      redispatch(
        "\n",
        lookahead(literal("\n"), bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        abandon(),
      ),
      on("\n", literal("\n"), paint(style)),
    ],
  };
}

/** Inline rules that do not require speculative state. */
export const inlineAtoms = [
  on(
    "<",
    literal("<"),
    byte(alpha),
    bytes(scheme, { min: 1, max: 31 }),
    literal(":"),
    bytes(uriBody, { min: 0 }),
    literal(">"),
    paint("text.uri"),
  ),
  on(
    "<",
    literal("<"),
    bytes(localPart),
    literal("@"),
    ...domainLabel,
    repeat(literal("."), ...domainLabel),
    literal(">"),
    paint("text.uri"),
  ),
  // Named entities are recognized by shape, not checked against the HTML entity list.
  on(
    "&",
    literal("&"),
    byte(alpha),
    bytes(alphanumeric, { min: 0, max: 31 }),
    literal(";"),
    paint("string.escape"),
  ),
  on(
    "&",
    literal("&#"),
    choice([byte("xX"), bytes(hex, { min: 1, max: 6 })], [bytes(digit, { min: 1, max: 7 })]),
    literal(";"),
    paint("string.escape"),
  ),
  on("\\", literal("\\"), byte("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"), paint("string.escape")),
  htmlTag,
  on(
    "hw",
    previousNotIn(alphanumeric),
    previousNotIn("<"),
    choice([literal("https://")], [literal("http://")], [literal("www.")]),
    bytes(urlText),
    repeat(
      choice(
        [bytes(urlText)],
        [literal("("), bytes(urlParenthesis, { min: 0 }), literal(")")],
        [bytes(".,!?;:)]}*_~"), lookahead(choice([byte(urlText)], [literal("(")]))],
      ),
    ),
    paint("text.uri"),
  ),
];

function linkTitleBody(close: string) {
  return {
    style: "string" as const,
    arms: [
      on("\\", literal("\\"), byte(except("\n\r")), paint("string.escape")),
      on(close, literal(close), paint("string"), setState("linkTitleEnd")),
      redispatch("\n", abandon()),
    ],
  };
}

let destinationPart = choice([bytes(except("()\\\n\r"))]);
for (let depth = 0; depth < 3; depth++) {
  destinationPart = choice(
    [bytes(except("()\\\n\r"))],
    [literal("("), repeat(destinationPart), literal(")")],
  );
}

export const linkStates = {
  linkText: {
    style: "text.reference" as const,
    arms: [
      token("](", "text.reference", setState("linkDestinationStart")),
      token("][", "text.reference", setState("linkReference")),
      token("]", "text.reference", popState()),
      redispatch("\n", notLookahead(baseState("paragraph", "headerStart")), abandon()),
      redispatch(
        "\n",
        lookahead(literal("\n"), bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        abandon(),
      ),
      token("\n", "text.reference"),
      ...inlineAtoms,
      ...emphasisOpeners,
      ...linkOpeners,
      codeSpanOpener("codeParagraph"),
      commentOpener("commentParagraph"),
    ],
  },
  linkReference: {
    style: "text.reference" as const,
    arms: [token("]", "text.reference", popState()), redispatch("\n", abandon())],
  },
  linkDestinationStart: {
    style: "text.uri" as const,
    arms: [
      on(" \t", bytes(" \t"), paint("text.uri")),
      redispatch("\n", notLookahead(baseState("paragraph", "headerStart")), abandon()),
      redispatch(
        "\n",
        lookahead(literal("\n"), bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        abandon(),
      ),
      token("\n", "text.uri"),
      redispatch(byteSet({ ranges: [[0, 255]] }), setState("linkDestination")),
    ],
  },
  linkDestination: {
    style: "text.uri" as const,
    arms: [
      on("\\", literal("\\"), byte(except("\n\r")), paint("string.escape")),
      on("(", literal("("), repeat(destinationPart), literal(")"), paint("text.uri")),
      token(")", "text.uri", popState()),
      on(" \t", bytes(" \t"), paint("text.uri"), setState("linkTitle")),
      redispatch("\n", notLookahead(baseState("paragraph", "headerStart")), abandon()),
      redispatch(
        "\n",
        lookahead(literal("\n"), bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        abandon(),
      ),
      token("\n", "text.uri", setState("linkTitle")),
    ],
  },
  linkTitle: {
    style: "plain" as const,
    arms: [
      on(" \t", bytes(" \t"), paint("text.uri")),
      redispatch("\n", notLookahead(baseState("paragraph", "headerStart")), abandon()),
      redispatch(
        "\n",
        lookahead(literal("\n"), bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        abandon(),
      ),
      token("\n", "text.uri"),
      token(")", "text.uri", popState()),
      token('"', "string", setState("linkTitleDouble")),
      token("'", "string", setState("linkTitleSingle")),
      token("(", "string", setState("linkTitleParen")),
      redispatch(byteSet({ ranges: [[0, 255]] }), abandon()),
    ],
  },
  linkTitleDouble: linkTitleBody('"'),
  linkTitleSingle: linkTitleBody("'"),
  linkTitleParen: linkTitleBody(")"),
  linkTitleEnd: {
    style: "plain" as const,
    arms: [
      on(" \t", bytes(" \t"), paint("text.uri")),
      token(")", "text.uri", popState()),
      redispatch(byteSet({ ranges: [[0, 255]] }), abandon()),
    ],
  },
};
