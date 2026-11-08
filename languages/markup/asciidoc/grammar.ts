import {
  byte,
  bytes,
  byteSet,
  choice,
  clearRange,
  closeInjection,
  defineGrammar,
  except,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  matchRun,
  notNext,
  on,
  openInjection,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  saveRange,
  saveRun,
  setState,
  slot,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";
import type { Style } from "#/grammar/styles.ts";

const all = byteSet({ ranges: [[0, 255]] });
const word = union(
  range("a", "z"),
  range("A", "Z"),
  range("0", "9"),
  "_",
  byteSet({ ranges: [[128, 255]] }),
);
const name = union(word, "-+.");
const nonLine = except(all, "\r\n");
const macroTarget = except(all, "[\r\n ");
const run = slot.run("block-delimiter", { scope: "frame" });
const language = slot.range("source-language");
const states: Record<string, State> = {};
const endOfLine = [optional(literal("\r")), lineEnd()] as const;
const delimiterEnd = lookahead(...endOfLine);
const lineClose = (start: string, inject = false) =>
  on(
    start,
    lineStart(),
    matchRun(run, { relation: "exact" }),
    ...endOfLine,
    ...(inject ? [closeInjection()] : []),
    paint("punctuation.delimiter"),
    popState(),
  );
const attribute = on(
  ":",
  lineStart(),
  literal(":"),
  optional(literal("!")),
  byte(name),
  bytes(name, { min: 0 }),
  optional(literal("!")),
  literal(":"),
  paint("attribute"),
);
// URLs include trailing punctuation; Asciidoctor's InlineLinkRx trims it:
// https://github.com/asciidoctor/asciidoctor/blob/v2.0.26/lib/asciidoctor/rx.rb#L524-L526
// Inline openers require a closer on the same physical line, even within a paragraph.
// Header author/revision lines are lexical; substitutions and table-cell attributes are not parsed.
const inline: Arm[] = [
  on("\\", literal("\\"), byte(except(all, "\r\n")), paint("string.escape")),
  on("{", literal("{"), byte(name), bytes(name, { min: 0 }), literal("}"), paint("variable")),
  on("[", literal("[["), bytes(except(all, "]\r\n")), literal("]]"), paint("label")),
  on("<", literal("<<"), bytes(except(all, ">\r\n")), literal(">>"), paint("text.reference")),
  ...["link:", "image::", "include::", "xref:", "xref::", "image:", "https://", "http://"].map(
    (prefix) =>
      on(
        prefix[0]!,
        literal(prefix),
        bytes(macroTarget),
        paint(prefix.startsWith("http") ? "text.uri" : "function"),
        pushState("macro"),
      ),
  ),
  on(" ", literal(" +"), ...endOfLine, paint("punctuation.special")),
];
// Formatting is line-local, uses byte-level boundaries, and requires the first matching run to close.
for (const [mark, style] of [
  ["*", "text.strong"],
  ["_", "text.emphasis"],
  ["`", "text.literal"],
  ["#", "constant.builtin"],
  ["^", "text.emphasis"],
  ["~", "text.emphasis"],
] as const satisfies readonly (readonly [string, Style])[]) {
  const key = mark.charCodeAt(0).toString();
  inline.push(
    on(
      mark,
      literal(mark + mark),
      notNext(" \t\r\n"),
      lookahead(bytes(except(all, mark + "\r\n")), literal(mark + mark)),
      paint(style),
      pushState(`inlineDouble${key}`),
    ),
  );
  inline.push(
    on(
      mark,
      previousNotIn(word),
      literal(mark),
      notNext(" \t\r\n"),
      lookahead(
        bytes(except(all, mark + "\r\n")),
        previousNotIn(" \t\r\n"),
        literal(mark),
        notNext(word),
      ),
      paint(style),
      pushState(`inlineSingle${key}`),
    ),
  );
  states[`inlineDouble${key}`] = {
    style,
    arms: [
      token(mark + mark, style, popState()),
      redispatch("\r\n", popState()),
      ...inline.slice(0, 5),
    ],
  };
  states[`inlineSingle${key}`] = {
    style,
    arms: [
      on(mark, previousNotIn(" \t\r\n"), literal(mark), notNext(word), paint(style), popState()),
      redispatch("\r\n", popState()),
      ...inline.slice(0, 5),
    ],
  };
}
states.macro = {
  style: "plain",
  arms: [token("[", "punctuation.bracket", setState("macroText"))],
  otherwise: [popState()],
};
states.macroText = {
  style: "plain",
  arms: [token("]", "punctuation.bracket", popState()), redispatch("\r\n", popState()), ...inline],
};
states.heading = { style: "text.title", arms: [redispatch("\r\n", popState()), ...inline] };
states.headerTitle = {
  style: "text.title",
  arms: [token("\n", "plain", setState("headerAuthor")), token("\r", "plain")],
};
const blankHeader = [
  on("\r", lineStart(), literal("\r\n"), paint("plain"), setState("lineStart")),
  on("\n", lineStart(), literal("\n"), paint("plain"), setState("lineStart")),
  token("\r", "plain"),
  token("\n", "plain"),
  attribute,
] as const;
const revision = on(
  "0123456789v",
  lineStart(),
  optional(literal("v")),
  byte("0123456789"),
  bytes(nonLine, { min: 0 }),
  paint("number"),
  setState("headerAttrs"),
);
states.headerAuthor = {
  style: "plain",
  arms: [
    ...blankHeader,
    revision,
    redispatch("=[/*", lookahead(lineStart()), setState("lineStart")),
    on(nonLine, lineStart(), bytes(nonLine), paint("label"), setState("headerRevision")),
    ...inline,
  ],
};
states.headerRevision = {
  style: "plain",
  arms: [
    ...blankHeader,
    revision,
    redispatch(nonLine, lookahead(lineStart()), setState("lineStart")),
    ...inline,
  ],
};
states.headerAttrs = {
  style: "plain",
  arms: [
    ...blankHeader,
    redispatch(nonLine, lookahead(lineStart()), setState("lineStart")),
    ...inline,
  ],
};
states.preambleAttr = { style: "plain", arms: [redispatch("\r\n", popState()), ...inline] };
states.lineComment = { style: "comment", arms: [redispatch("\r\n", popState())] };
const blocks: Arm[] = [];
for (const [mark, kind, style] of [
  ["-", "listing", "text.literal"],
  [".", "literal", "text.literal"],
  ["+", "pass", "text.literal"],
  ["/", "comment", "comment"],
  ["=", "example", "plain"],
  ["*", "sidebar", "plain"],
  ["_", "quote", "plain"],
] as const satisfies readonly (readonly [string, string, Style])[]) {
  blocks.push(
    on(
      mark,
      lineStart(),
      bytes(mark, { min: 4 }),
      delimiterEnd,
      paint("punctuation.delimiter"),
      pushState(`block${kind}`),
      saveRun(run),
    ),
  );
  if (style !== "plain") states[`block${kind}`] = { style, arms: [lineClose(mark)] };
}
blocks.push(
  on(
    "-",
    lineStart(),
    literal("--"),
    delimiterEnd,
    paint("punctuation.delimiter"),
    pushState("blockopen"),
    saveRun(run),
  ),
  on(
    "`",
    lineStart(),
    literal("```"),
    notNext("`"),
    paint("punctuation.delimiter"),
    pushState("blockfenced"),
  ),
);
states.blockfenced = {
  style: "text.literal",
  arms: [
    on("`", lineStart(), literal("```"), ...endOfLine, paint("punctuation.delimiter"), popState()),
  ],
};
states.blockInjected = { style: "plain", arms: [lineClose("-", true)] };
states.sourceStart = {
  style: "attribute",
  arms: [on(name, bytes(name), saveRange(language), paint("label"), setState("sourceTail"))],
  otherwise: [popState()],
};
states.sourceTail = { style: "attribute", arms: [token("\n", "plain", setState("sourcePending"))] };
states.sourcePending = {
  style: "plain",
  arms: [
    on(
      "-",
      lineStart(),
      bytes("-", { min: 4 }),
      delimiterEnd,
      saveRun(run),
      paint("punctuation.delimiter"),
      setState("sourceDelimiterEnd"),
    ),
    on(
      ".",
      lineStart(),
      literal("."),
      byte(except(nonLine, " \t")),
      bytes(nonLine, { min: 0 }),
      paint("text.title"),
    ),
    on(
      "[",
      lineStart(),
      literal("["),
      bytes(except(all, "]\r\n")),
      literal("]"),
      ...endOfLine,
      paint("attribute"),
    ),
    on("\n", lineStart(), literal("\n"), paint("plain"), popState()),
    token("\n", "plain"),
    token("\r", "plain"),
  ],
  otherwise: [popState()],
};
states.sourceDelimiterEnd = {
  style: "plain",
  arms: [
    token("\r", "plain"),
    token("\n", "plain", openInjection({ named: language }), setState("blockInjected")),
  ],
};
const source = on(
  "[",
  lineStart(),
  choice(
    [literal("[source"), optional(literal("%"), bytes(except(all, ",]\r\n"))), literal(",")],
    [literal("[,")],
  ),
  optional(bytes(" \t")),
  clearRange(language),
  paint("attribute"),
  pushState("sourceStart"),
);
const blockAttributes = on(
  "[",
  lineStart(),
  literal("["),
  bytes(except(all, "]\r\n")),
  literal("]"),
  ...endOfLine,
  paint("attribute"),
);
// Legacy two-line heading lengths are approximated; long underlines are not measured against text.
const underline = (min: number, max?: number) =>
  choice(...["=", "-", "~", "^", "+"].map((mark) => [bytes(mark, { min, max })]));
const underlinedHeading = on(
  except(nonLine, "=*-_/.+[`"),
  lineStart(),
  choice(
    ...Array.from({ length: 7 }, (_, i) => [
      bytes(nonLine, { min: i + 1, max: i + 1 }),
      optional(literal("\r")),
      literal("\n"),
      underline(Math.max(2, i - 1), i + 3),
    ]),
    [bytes(nonLine), optional(literal("\r")), literal("\n"), underline(8)],
  ),
  ...endOfLine,
  paint("text.title"),
);
const lines: Arm[] = [
  source,
  blockAttributes,
  on(
    "|",
    lineStart(),
    literal("|==="),
    ...endOfLine,
    paint("punctuation.delimiter"),
    pushState("table"),
  ),
  ...blocks,
  on("/", lineStart(), literal("//"), notNext("/"), paint("comment"), pushState("lineComment")),
  attribute,
  on(
    "=",
    lineStart(),
    bytes("=", { min: 2, max: 6 }),
    byte(" \t"),
    paint("text.title"),
    pushState("heading"),
  ),
  on(
    ".",
    lineStart(),
    literal("."),
    notNext(" .0123456789\r\n"),
    paint("text.title"),
    pushState("heading"),
  ),
  ...["NOTE:", "TIP:", "IMPORTANT:", "CAUTION:", "WARNING:"].map((word) =>
    on(word[0]!, lineStart(), literal(word), paint("keyword")),
  ),
  on("*-.", lineStart(), bytes("*", { min: 1, max: 5 }), byte(" \t"), paint("punctuation.special")),
  on("-.", lineStart(), byte("-."), byte(" \t"), paint("punctuation.special")),
  on(".", lineStart(), bytes(".", { min: 2, max: 5 }), byte(" \t"), paint("punctuation.special")),
  on(
    "0123456789",
    lineStart(),
    bytes("0123456789"),
    literal("."),
    byte(" \t"),
    paint("punctuation.special"),
  ),
  on("|", lineStart(), literal("|"), paint("punctuation.special")),
  on(
    nonLine,
    lineStart(),
    bytes(except(all, ":\r\n")),
    literal("::"),
    lookahead(byte(" \t\r\n")),
    paint("label"),
  ),
];
states.table = {
  style: "plain",
  arms: [
    on("|", lineStart(), literal("|==="), ...endOfLine, paint("punctuation.delimiter"), popState()),
    source,
    blockAttributes,
    ...blocks,
    token("|", "punctuation.special"),
    ...inline,
  ],
};
for (const [mark, kind] of [
  ["=", "example"],
  ["*", "sidebar"],
  ["_", "quote"],
  ["-", "open"],
] as const) {
  states[`block${kind}`] = { style: "plain", arms: [lineClose(mark), ...lines, ...inline] };
}
// The line-start rules dispatch on nearly every byte, so they are tried in their own state
// once per line; the text state's fallback is then free to scan prose runs.
const continuing = (arm: Arm): Arm =>
  arm.then.some(
    (effect) => effect.kind === "push" || effect.kind === "pop" || effect.kind === "goto",
  )
    ? arm
    : { ...arm, then: [...arm.then, setState("root")] };
states.lineStart = {
  style: "plain",
  arms: [underlinedHeading, ...lines].map(continuing),
  otherwise: [setState("root")],
};
states.root = {
  style: "plain",
  arms: [token("\n", "plain", setState("lineStart")), ...inline],
};
states.preamble = {
  style: "plain",
  arms: [
    on(
      "/",
      lineStart(),
      bytes("/", { min: 4 }),
      delimiterEnd,
      paint("punctuation.delimiter"),
      pushState("blockcomment"),
      saveRun(run),
    ),
    on("/", lineStart(), literal("//"), notNext("/"), paint("comment"), pushState("lineComment")),
    on(
      "[",
      lineStart(),
      literal("[["),
      bytes(except(all, "]\r\n")),
      literal("]]"),
      ...endOfLine,
      paint("label"),
    ),
    on(
      ":",
      lineStart(),
      literal(":"),
      optional(literal("!")),
      byte(name),
      bytes(name, { min: 0 }),
      optional(literal("!")),
      literal(":"),
      paint("attribute"),
      pushState("preambleAttr"),
    ),
    on("=", lineStart(), literal("= "), paint("text.title"), setState("headerTitle")),
    token("\r", "plain"),
    token("\n", "plain"),
  ],
  otherwise: [setState("lineStart")],
};
export default defineGrammar({
  name: "asciidoc",
  extensions: ["adoc", "asciidoc", "asc"],
  aliases: ["adoc", "asc"],
  initial: "preamble",
  states,
});
