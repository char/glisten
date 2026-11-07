import {
  abandon,
  baseState,
  byte,
  bytes,
  byteSet,
  choice,
  clearRange,
  closeInjection,
  defineGrammar,
  indentTo,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  repeat,
  matchRun,
  notLookahead,
  notNext,
  on,
  oneOf,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  saveColumn,
  saveRange,
  saveRun,
  separatedRun,
  setState,
  slot,
  speculate,
  token,
  union,
} from "#/grammar/mod.ts";
import {
  codeSpanCloser,
  codeSpanOpener,
  commentCloser,
  commentOpener,
  emphasisOpeners,
  emphasisState,
  inlineAtoms,
  linkOpeners,
  linkStates,
} from "./inline.ts";

const fenceRunSlot = slot.run("fence");
const languageRangeSlot = slot.range("language");
const itemColumnSlot = slot.column("item");

const notLineBreak = union(
  range("\x00", "\t"),
  range("\x0b", "\x0c"),
  byteSet({ ranges: [[14, 255]] }),
);
const nonWhitespace = union(
  range("\x00", "\x08"),
  range("\x0b", "\x0c"),
  range("\x0e", "\x1f"),
  byteSet({ ranges: [[33, 255]] }),
);
const allBytes = byteSet({ ranges: [[0, 255]] });
const headerText = union(range("A", "Z"), range("a", "z"), byteSet({ ranges: [[128, 255]] }));
const labelBytes = union(
  range("\x00", "\t"),
  range("\x0b", "\x0c"),
  range("\x0e", "Z"),
  byteSet({ ranges: [[94, 255]] }),
);
const labelNonWhitespace = union(
  range("\x00", "\x08"),
  range("\x0b", "\x0c"),
  range("\x0e", "\x1f"),
  range("!", "\\"),
  byteSet({ ranges: [[94, 255]] }),
);
const destinationBytes = union(
  range("!", "'"),
  range("*", ";"),
  range("=", "="),
  range("?", "["),
  range("]", "~"),
  byteSet({ ranges: [[128, 255]] }),
);
const angleDestinationBytes = union(
  range("\x00", "\t"),
  range("\x0b", "\x0c"),
  range("\x0e", ";"),
  range("=", "="),
  range("?", "["),
  byteSet({ ranges: [[93, 255]] }),
);
const infoBytes = union(
  range("\x00", "\x08"),
  range("\x0b", "\x0c"),
  range("\x0e", "\x1f"),
  byteSet({ ranges: [[33, 255]] }),
);
const noBacktick = union(
  range("\x00", "\t"),
  range("\x0b", "\x0c"),
  range("\x0e", "_"),
  byteSet({ ranges: [[97, 255]] }),
);
const indent = choice([literal("   ")], [literal("  ")], [literal(" ")], []);
const fence = () => [
  on(
    " `",
    indent,
    bytes("`", { min: 3 }),
    lookahead(bytes(noBacktick, { min: 0 }), optional(literal("\r")), lineEnd()),
    saveRun(fenceRunSlot),
    clearRange(languageRangeSlot),
    paint("punctuation.delimiter"),
    setState("fenceInfo"),
  ),
  on(
    " ~",
    indent,
    bytes("~", { min: 3 }),
    saveRun(fenceRunSlot),
    clearRange(languageRangeSlot),
    paint("punctuation.delimiter"),
    setState("fenceInfo"),
  ),
];
const digits = "0123456789";
const listPadding = choice(
  [lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()), optional(byte(" \t"))],
  [literal("\t")],
  ...[4, 3, 2].map((n) => [literal(" ".repeat(n)), notNext(" \t")]),
  [literal(" ")],
);
const list = ({ context }: { context: "block" | "interrupt" }) => [
  on(
    " -+*",
    indent,
    byte("-+*"),
    ...(context === "interrupt" ? [lookahead(bytes(" \t"), byte(nonWhitespace))] : []),
    listPadding,
    paint("punctuation.special"),
    setState("block"),
    pushState("item"),
    saveColumn(itemColumnSlot),
  ),
  on(
    context === "interrupt" ? " 01" : ` ${digits}`,
    indent,
    ...(context === "interrupt"
      ? [bytes("0", { min: 0, max: 8 }), literal("1")]
      : [bytes(digits, { min: 1, max: 9 })]),
    byte(".)"),
    ...(context === "interrupt" ? [lookahead(bytes(" \t"), byte(nonWhitespace))] : []),
    listPadding,
    paint("punctuation.special"),
    setState("block"),
    pushState("item"),
    saveColumn(itemColumnSlot),
  ),
];
const fenceInfo = ({ body, tail }: { body: string; tail: string }) => ({
  style: "plain" as const,
  arms: [
    on(" \t", bytes(" \t"), paint("plain")),
    token("\n", "plain", openInjection({ named: languageRangeSlot }), setState(body)),
    on(infoBytes, bytes(infoBytes), saveRange(languageRangeSlot), paint("label"), setState(tail)),
  ],
});
const fenceInfoTail = (body: string) => ({
  style: "plain" as const,
  arms: [token("\n", "plain", openInjection({ named: languageRangeSlot }), setState(body))],
});
const fenceCloser = (next: string) =>
  on(
    " `~",
    indent,
    matchRun(fenceRunSlot),
    bytes(" \t", { min: 0 }),
    optional(literal("\r")),
    lineEnd(),
    closeInjection(),
    paint("punctuation.delimiter"),
    setState(next),
  );
const thematic = ({ next, marks = "*-_" }: { next: string; marks?: string }) => [
  on(
    ` ${marks}`,
    indent,
    separatedRun(marks, " \t", 3),
    optional(literal("\r")),
    lineEnd(),
    paint("punctuation.delimiter"),
    setState(next),
  ),
];
const insensitive = (text: string) =>
  [...text].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const rawHtmlName = choice(...["script", "pre", "style", "textarea"].map(insensitive));
const htmlBlockName = choice(
  ..."address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul"
    .split(" ")
    .sort((a, b) => b.length - a.length)
    .map(insensitive),
);
const htmlBoundary = choice(
  [byte(" \t")],
  [literal("/>")],
  [literal(">")],
  [lineEnd()],
  [literal("\r"), lineEnd()],
);
const tableNoPipe = union(
  range("\x00", "\t"),
  range("\x0b", "\x0c"),
  range("\x0e", "{"),
  byteSet({ ranges: [[125, 255]] }),
);
const setextUnderline = [
  indent,
  choice([bytes("=")], [bytes("-")]),
  bytes(" \t", { min: 0 }),
  optional(literal("\r")),
  lineEnd(),
];
const tableCell = [
  bytes(" \t", { min: 0 }),
  optional(literal(":")),
  bytes("-"),
  optional(literal(":")),
  bytes(" \t", { min: 0 }),
];
// GFM approximations for highlighting: setext pipes retain delimiter styling,
// table column counts are unchecked, and inline spans can cross cell pipes.
const tableDelimiter = [
  indent,
  lookahead(optional(bytes(tableNoPipe)), literal("|")),
  optional(literal("|")),
  ...tableCell,
  repeat(literal("|"), ...tableCell),
  optional(literal("|")),
  optional(literal("\r")),
  lineEnd(),
];
const htmlNameStart = union(range("a", "z"), range("A", "Z"));
const htmlNameRest = union("-", range("a", "z"), range("A", "Z"), range("0", "9"));
const attributeStart = union("_:", range("a", "z"), range("A", "Z"));
const attributeRest = union("_:.-", range("a", "z"), range("A", "Z"), range("0", "9"));
const attributeValue = choice(
  [
    literal('"'),
    bytes(
      union(
        range("\x00", "\t"),
        range("\x0b", "\x0c"),
        range("\x0e", "!"),
        byteSet({ ranges: [[35, 255]] }),
      ),
      { min: 0 },
    ),
    literal('"'),
  ],
  [
    literal("'"),
    bytes(
      union(
        range("\x00", "\t"),
        range("\x0b", "\x0c"),
        range("\x0e", "&"),
        byteSet({ ranges: [[40, 255]] }),
      ),
      { min: 0 },
    ),
    literal("'"),
  ],
  [
    bytes(
      union(
        range("\x00", "\x08"),
        range("\x0b", "\x0c"),
        range("\x0e", "\x1f"),
        range("!", "!"),
        range("#", "&"),
        range("(", ";"),
        range("?", "_"),
        byteSet({ ranges: [[97, 255]] }),
      ),
    ),
  ],
);
const attribute = [
  bytes(" \t"),
  byte(attributeStart),
  bytes(attributeRest, { min: 0 }),
  optional(bytes(" \t", { min: 0 }), literal("="), bytes(" \t", { min: 0 }), attributeValue),
];
const htmlStarts = ({ context }: { context: "block" | "interrupt" }) => [
  on(
    " <",
    indent,
    literal("<"),
    rawHtmlName,
    lookahead(choice([byte(" \t")], [literal(">")], [lineEnd()], [literal("\r"), lineEnd()])),
    paint("punctuation.special"),
    setState("htmlRaw"),
  ),
  ...(
    [
      ["<!--", "htmlComment", "comment"],
      ["<?", "htmlInstruction", "punctuation.special"],
      ["<![CDATA[", "htmlCdata", "punctuation.special"],
    ] as const
  ).map(([opener, state, style]) =>
    on(" <", indent, literal(opener), paint(style), setState(state)),
  ),
  on(
    " <",
    indent,
    literal("<!"),
    byte(range("A", "Z")),
    paint("punctuation.special"),
    setState("htmlDeclaration"),
  ),
  on(
    " <",
    indent,
    literal("<"),
    optional(literal("/")),
    htmlBlockName,
    lookahead(htmlBoundary),
    paint("punctuation.special"),
    setState("htmlBlock"),
  ),
  ...(context === "block"
    ? [
        on(
          " <",
          indent,
          literal("<"),
          choice(
            [
              literal("/"),
              byte(htmlNameStart),
              bytes(htmlNameRest, { min: 0 }),
              bytes(" \t", { min: 0 }),
            ],
            [
              byte(htmlNameStart),
              bytes(htmlNameRest, { min: 0 }),
              repeat(...attribute),
              bytes(" \t", { min: 0 }),
              optional(literal("/")),
            ],
          ),
          literal(">"),
          lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
          paint("punctuation.special"),
          setState("htmlBlock"),
        ),
      ]
    : []),
];
const definitionEscape = [literal("\\"), byte(notLineBreak)];
let destinationPart = choice(definitionEscape, [bytes(destinationBytes)]);
for (let depth = 0; depth < 3; depth++) {
  destinationPart = choice(
    definitionEscape,
    [bytes(destinationBytes)],
    [literal("("), repeat(destinationPart), literal(")")],
  );
}
const destination = choice(
  [literal("<"), repeat(choice(definitionEscape, [bytes(angleDestinationBytes)])), literal(">")],
  [destinationPart, repeat(destinationPart)],
);
const labelPart = choice([literal("\\"), byte("[]\\")], [bytes(labelBytes)], [literal("\\")]);
const title = choice(
  ...(
    [
      ['"', '"'],
      ["'", "'"],
      ["(", ")"],
    ] as const
  ).map(([open, close]) => [
    literal(open),
    repeat(
      choice(definitionEscape, [
        bytes(
          union(
            range("\x00", "\t"),
            range("\x0b", "\x0c"),
            byteSet({
              ranges: [
                [14, open.charCodeAt(0) - 1],
                [close.charCodeAt(0) + 1, 91],
                [93, 255],
              ],
            }),
          ),
        ),
      ]),
    ),
    literal(close),
  ]),
);
const definitionEnd = [bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()];
const definitionHead = [
  indent,
  literal("["),
  lookahead(bytes(" \t", { min: 0 }), byte(labelNonWhitespace)),
  labelPart,
  repeat(labelPart),
  literal("]:"),
  bytes(" \t", { min: 0 }),
];
const definition = on(
  " [",
  ...definitionHead,
  lookahead(
    optional(optional(literal("\r")), literal("\n"), bytes(" \t", { min: 0 })),
    destination,
    choice([bytes(" \t"), title, ...definitionEnd], definitionEnd),
  ),
  paint("text.reference"),
  setState("definitionDestination"),
);
const headingPrefix = [
  indent,
  choice(...[6, 5, 4, 3, 2, 1].map((length) => [literal("#".repeat(length))])),
  choice([byte(" \t")], [lineEnd()]),
];

const noBlankInline = notLookahead(
  baseState("paragraph", "headerStart"),
  bytes(" \t", { min: 0 }),
  optional(literal("\r")),
  lineEnd(),
);

const lazyInterrupt = choice(
  [bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()],
  [indent, literal(">")],
  [indent, byte("-+*"), choice([byte(" \t")], [lineEnd()])],
  [indent, bytes(digits, { min: 1, max: 9 }), byte(".)"), choice([byte(" \t")], [lineEnd()])],
  ...fence().map((arm) => arm.match),
  ...htmlStarts({ context: "interrupt" }).map((arm) => arm.match),
  ...thematic({ next: "block" }).map((arm) => arm.match),
  headingPrefix,
);

export const blockGrammar = defineGrammar({
  initial: "start",
  name: "markdown",
  aliases: ["md"],
  states: {
    start: {
      style: "plain",
      arms: [
        on(
          "-",
          literal("---"),
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          literal("\n"),
          paint("punctuation.delimiter"),
          openInjection({ static: "yaml" }),
          setState("frontMatter"),
        ),
        redispatch(allBytes, setState("block")),
      ],
    },
    frontMatter: {
      style: "plain",
      arms: [
        on(
          "-",
          lineStart(),
          literal("---"),
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          lineEnd(),
          closeInjection(),
          paint("punctuation.delimiter"),
          setState("block"),
        ),
      ],
    },
    block: {
      style: "plain",
      otherwise: "paragraph",
      arms: [
        token(oneOf("\n\r"), "plain"),
        on(
          " ",
          literal("    "),
          lookahead(bytes(" \t", { min: 0 }), byte(nonWhitespace)),
          paint("text.literal"),
          setState("code"),
        ),
        ...thematic({ next: "block" }),
        definition,
        on(
          " >",
          indent,
          literal(">"),
          optional(literal(" ")),
          paint("punctuation.special"),
          pushState("quote"),
        ),
        ...list({ context: "block" }),
        ...fence(),
        ...htmlStarts({ context: "block" }),
        on(" #", ...headingPrefix, paint("text.title"), setState("heading")),
        redispatch(allBytes, setState("headerStart")),
      ],
    },
    paragraph: {
      style: "plain",
      arms: [token("\n", "plain", setState("paragraphLine"))],
    },
    paragraphLine: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("block")),
        ...thematic({ next: "block", marks: "*_" }),
        on(
          " >",
          indent,
          literal(">"),
          optional(literal(" ")),
          paint("punctuation.special"),
          pushState("quote"),
        ),
        ...list({ context: "interrupt" }),
        ...fence(),
        ...htmlStarts({ context: "interrupt" }),
        on(" #", ...headingPrefix, paint("text.title"), setState("heading")),
        redispatch(allBytes, setState("paragraph")),
      ],
    },
    quote: {
      style: "plain",
      prefix: {
        match: [indent, literal(">"), optional(literal(" ")), noBlankInline],
        style: "punctuation.special",
        lazy: {
          top: ["paragraph", "paragraphLine", "headerStart"],
          unless: [lookahead(lazyInterrupt)],
        },
      },
      otherwise: [pushState("block")],
      arms: [],
    },
    item: {
      style: "plain",
      prefix: {
        match: [
          choice(
            [indentTo(itemColumnSlot)],
            [lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd())],
          ),
          noBlankInline,
        ],
        style: "punctuation.special",
        lazy: {
          top: ["paragraph", "paragraphLine", "headerStart"],
          unless: [lookahead(lazyInterrupt)],
        },
      },
      otherwise: [pushState("block")],
      arms: [
        on(
          "[",
          literal("["),
          byte(" xX"),
          literal("]"),
          lookahead(choice([byte(" \t")], [lineEnd()])),
          paint("punctuation.special"),
        ),
      ],
    },
    headerStart: {
      style: "plain",
      otherwise: "paragraph",
      arms: [
        token("|", "punctuation.delimiter", speculate("headerCandidate")),
        token(oneOf(allBytes), "text.title", speculate("headerCandidate")),
      ],
    },
    headerCandidate: {
      style: "text.title",
      arms: [
        // Pipes are table delimiters if the next line makes this a table header; a setext
        // heading keeps them as delimiters too, which is rare enough not to speculate on.
        token("|", "punctuation.delimiter"),
        token("\n", "text.title", setState("headerLine")),
      ],
    },
    headerLine: {
      style: "text.title",
      arms: [
        on(" =-", ...setextUnderline, paint("text.title"), popState(), setState("block")),
        on(
          " \t-|:",
          ...tableDelimiter,
          paint("punctuation.delimiter"),
          popState(),
          setState("tableRow"),
        ),
        on(
          allBytes,
          indent,
          byte(union(headerText, "|")),
          paint("text.title"),
          setState("headerCandidate"),
        ),
        redispatch(allBytes, abandon()),
      ],
    },
    tableRow: {
      style: "plain",
      arms: [token("|", "punctuation.delimiter"), token("\n", "plain", setState("tableLine"))],
    },
    tableLine: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("block")),
        ...thematic({ next: "block" }),
        on(
          " >",
          indent,
          literal(">"),
          optional(literal(" ")),
          paint("punctuation.special"),
          pushState("quote"),
        ),
        ...list({ context: "interrupt" }),
        ...fence(),
        ...htmlStarts({ context: "interrupt" }),
        on(" #", ...headingPrefix, paint("text.title"), setState("heading")),
        redispatch(allBytes, setState("tableRow")),
      ],
    },
    definitionDestination: {
      style: "plain",
      arms: [
        token("\n", "plain"),
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        on(allBytes, destination, paint("text.uri"), setState("definitionTail")),
      ],
    },
    definitionTail: {
      style: "plain",
      arms: [
        on(
          " \t\r",
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          lookahead(literal("\n"), bytes(" \t", { min: 0 }), title, ...definitionEnd),
          paint("plain"),
        ),
        on(
          "\n",
          literal("\n"),
          lookahead(bytes(" \t", { min: 0 }), title, ...definitionEnd),
          paint("plain"),
          setState("definitionTitle"),
        ),
        on(
          " \t",
          bytes(" \t"),
          lookahead(title, ...definitionEnd),
          paint("text.reference"),
          setState("definitionTitle"),
        ),
        redispatch(allBytes, setState("definitionFinish")),
      ],
    },
    definitionTitle: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on("\"'(", title, paint("string"), setState("definitionFinish")),
      ],
    },
    definitionFinish: {
      style: "plain",
      arms: [token("\n", "plain", popState({ atRoot: "block" }))],
    },
    htmlRaw: {
      style: "punctuation.special",
      arms: [
        on(
          "<",
          literal("</"),
          rawHtmlName,
          literal(">"),
          bytes(notLineBreak, { min: 0 }),
          paint("punctuation.special"),
          setState("block"),
        ),
      ],
    },
    htmlBlock: {
      style: "punctuation.special",
      arms: [
        on(
          "\n",
          literal("\n"),
          lookahead(
            bytes(" \t", { min: 0 }),
            optional(literal("\r")),
            choice([literal("\n")], [lineEnd()]),
          ),
          paint("plain"),
          setState("block"),
        ),
        token("\n", "punctuation.special", setState("htmlBlockLine")),
      ],
    },
    htmlBlockLine: {
      style: "punctuation.special",
      arms: [
        on(
          allBytes,
          lookahead(
            bytes(" \t", { min: 0 }),
            optional(literal("\r")),
            choice([literal("\n")], [lineEnd()]),
          ),
          byte(allBytes),
          paint("plain"),
          setState("block"),
        ),
        redispatch(allBytes, setState("htmlBlock")),
      ],
    },
    htmlComment: {
      style: "comment",
      arms: [
        on(
          "-",
          literal("-->"),
          bytes(notLineBreak, { min: 0 }),
          paint("comment"),
          setState("block"),
        ),
      ],
    },
    htmlInstruction: {
      style: "punctuation.special",
      arms: [
        on(
          "?",
          literal("?>"),
          bytes(notLineBreak, { min: 0 }),
          paint("punctuation.special"),
          setState("block"),
        ),
      ],
    },
    htmlCdata: {
      style: "punctuation.special",
      arms: [
        on(
          "]",
          literal("]]>"),
          bytes(notLineBreak, { min: 0 }),
          paint("punctuation.special"),
          setState("block"),
        ),
      ],
    },
    htmlDeclaration: {
      style: "punctuation.special",
      arms: [
        on(
          ">",
          literal(">"),
          bytes(notLineBreak, { min: 0 }),
          paint("punctuation.special"),
          setState("block"),
        ),
      ],
    },
    heading: {
      style: "text.title",
      arms: [token("\n", "plain", setState("block"))],
    },
    fenceInfo: fenceInfo({ body: "fenceLine", tail: "fenceInfoTail" }),
    fenceInfoTail: fenceInfoTail("fenceLine"),
    fenceLine: {
      style: "plain",
      otherwise: [setState("fenceBody")],
      arms: [fenceCloser("block")],
    },
    fenceBody: {
      style: "plain",
      arms: [token("\n", "plain", setState("fenceLine"))],
    },
    code: {
      style: "text.literal",
      arms: [token("\n", "text.literal", setState("codeLine"))],
    },
    codeLine: {
      style: "text.literal",
      arms: [
        token("    ", "text.literal", setState("code")),
        on(
          " \t\r\n",
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          literal("\n"),
          paint("text.literal"),
        ),
        on(
          " \t\r",
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          lineEnd(),
          paint("text.literal"),
        ),
        redispatch(allBytes, setState("block")),
      ],
    },
  },
});

const inlineStates = ["paragraph", "heading", "headerCandidate", "tableRow"] as const;
const states = { ...blockGrammar.states };
for (const name of inlineStates) {
  const state = states[name];
  const lineBounded = name === "heading" || name === "tableRow";
  states[name] = {
    ...state,
    arms: [
      commentOpener(lineBounded ? "commentHeading" : "commentParagraph"),
      ...inlineAtoms,
      ...emphasisOpeners,
      ...linkOpeners,
      codeSpanOpener(lineBounded ? "codeHeading" : "codeParagraph"),
      ...state.arms,
    ],
  };
}
export default defineGrammar({
  ...blockGrammar,
  states: {
    ...states,
    block: {
      ...states.block,
      arms: states.block.arms.flatMap((arm) =>
        arm === definition
          ? [
              arm,
              on(
                " [",
                ...definitionHead,
                lookahead(byte(nonWhitespace)),
                paint("text.reference"),
                speculate("definitionProbe", "inline"),
              ),
            ]
          : [arm],
      ),
    },
    definitionProbe: { style: "plain", arms: [redispatch(allBytes, abandon())] },
    headerStart: {
      ...states.headerStart,
      otherwise: [setState("paragraph")],
      arms: [
        commentOpener("commentParagraph"),
        ...inlineAtoms,
        ...emphasisOpeners,
        ...linkOpeners,
        codeSpanOpener("codeParagraph"),
        token("\n", "text.title", speculate("headerLine")),
        token("\n", "plain", setState("paragraphLine")),
        token("|", "punctuation.delimiter", speculate("headerCandidate")),
        on(
          allBytes,
          notNext("\n"),
          byte(allBytes),
          paint("text.title"),
          speculate("headerCandidate"),
        ),
      ],
    },
    paragraph: {
      ...states.paragraph,
      arms: [
        commentOpener("commentParagraph"),
        ...inlineAtoms,
        ...emphasisOpeners,
        ...linkOpeners,
        codeSpanOpener("codeParagraph"),
        ...states.paragraph.arms,
      ],
    },
    ...linkStates,
    strikeSingle: emphasisState("~", "text.strikethrough"),
    strikeDouble: emphasisState("~~", "text.strikethrough"),
    emphasisStar: emphasisState("*", "text.emphasis"),
    emphasisUnderscore: emphasisState("_", "text.emphasis"),
    strongStar: emphasisState("**", "text.strong"),
    strongUnderscore: emphasisState("__", "text.strong"),
    tripleStar: emphasisState("***", "text.strong"),
    tripleUnderscore: emphasisState("___", "text.strong"),
    commentParagraph: {
      style: "comment",
      arms: [
        commentCloser,
        redispatch("\n", lookahead(literal("\n"), bytes(" \t", { min: 0 }), lineEnd()), abandon()),
      ],
    },
    commentHeading: { style: "comment", arms: [commentCloser, redispatch("\n", abandon())] },
    codeParagraph: {
      style: "text.literal",
      arms: [
        codeSpanCloser,
        redispatch("\n", lookahead(literal("\n"), bytes(" \t", { min: 0 }), lineEnd()), abandon()),
      ],
    },
    codeHeading: { style: "text.literal", arms: [codeSpanCloser, redispatch("\n", abandon())] },
  },
});
