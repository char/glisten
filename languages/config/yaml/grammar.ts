import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  indentTo,
  keywordTable,
  lineEnd,
  lineStart,
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
  repeat,
  saveColumn,
  setState,
  slot,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const parent = slot.column("parent");
const content = slot.column("content");
const all = byteSet({ ranges: [[0, 255]] });
const nonspace = except(all, " \r\n");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const word = except(all, " \t\r\n,[]{}:#");
const scalarTail = repeat(
  choice(
    [byte(word)],
    [literal(":"), notNext(" \t\r\n,[]{}")],
    [literal("#")],
    [bytes(" \t"), notNext("#\r\n"), byte(word)],
  ),
);
const plain = [byte(word), scalarTail];
const blockWord = except(all, " \t\r\n:#");
const blockTail = repeat(
  choice(
    [byte(blockWord)],
    [literal(":"), notNext(" \t\r\n")],
    [literal("#")],
    [bytes(" \t"), notNext("#\r\n"), byte(blockWord)],
  ),
);
const blockPlain = [byte(word), blockTail];
const singleKey = [
  literal("'"),
  repeat(choice([literal("''")], [byte(except(all, "'\r\n"))])),
  literal("'"),
];
const doubleKey = [
  literal('"'),
  repeat(choice([literal("\\"), character()], [byte(except(all, '"\\\r\n'))])),
  literal('"'),
];
const keyName = choice(singleKey, doubleKey, plain);
const headerEnd = lookahead(
  choice(
    [bytes(" \t"), literal("#")],
    [bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()],
  ),
);
const end = lookahead(
  choice(
    [bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()],
    [bytes(" \t"), literal("#")],
    [byte(",]}")],
  ),
);
const quotedEscape = on(
  "\\",
  literal("\\"),
  choice(
    [byte('0abtnvfre "\\/N_LP')],
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
  ),
  paint("string.escape"),
);
const numbers = on(
  union(digit, "+-."),
  optional(byte("+-")),
  choice(
    [literal("0x"), bytes(hex)],
    [literal("0o"), bytes(range("0", "7"))],
    [
      bytes(digit),
      optional(literal("."), bytes(digit, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    ],
    [literal("."), bytes(digit), optional(byte("eE"), optional(byte("+-")), bytes(digit))],
  ),
  end,
  paint("number"),
);
const blank = [
  on(" ", bytes(" "), optional(literal("\r")), literal("\n"), paint("string")),
  token("\n", "string"),
  token("\r\n", "string"),
  on(" ", bytes(" "), optional(literal("\r")), lineEnd(), paint("string")),
  on("\r", literal("\r"), lineEnd(), paint("string")),
];
const blockStates: Record<string, State> = {};
for (const kind of ["zero", "indented"] as const) {
  const parentIndent = kind === "zero" ? [] : [indentTo(parent)];
  const first = `blockFirst_${kind}`;
  blockStates[first] = {
    style: "plain",
    arms: [
      ...blank,
      on(
        " ",
        lineStart(),
        ...parentIndent,
        bytes(" "),
        lookahead(byte(nonspace)),
        saveColumn(content),
        paint("string"),
        setState("blockText_auto"),
      ),
    ],
    otherwise: [popState()],
  };
  for (let n = 1; n <= 9; n++) {
    const state = `blockLine_${kind}_${n}`;
    blockStates[state] = {
      style: "plain",
      arms: [
        ...blank,
        on(
          " ",
          lineStart(),
          ...parentIndent,
          literal(" ".repeat(n)),
          paint("string"),
          setState(`blockText_${kind}_${n}`),
        ),
      ],
      otherwise: [popState()],
    };
    blockStates[`blockText_${kind}_${n}`] = {
      style: "string",
      arms: [token("\n", "string", setState(state))],
    };
  }
}
blockStates.blockLine_auto = {
  style: "plain",
  arms: [
    ...blank,
    on(" ", lineStart(), indentTo(content), paint("string"), setState("blockText_auto")),
  ],
  otherwise: [popState()],
};
blockStates.blockText_auto = {
  style: "string",
  arms: [token("\n", "string", setState("blockLine_auto"))],
};
const blockOpen = (kind: "zero" | "indented") => [
  ...Array.from({ length: 9 }, (_, i) => i + 1).flatMap((n) => [
    on(
      "|>",
      byte("|>"),
      literal(String(n)),
      optional(byte("+-")),
      headerEnd,
      paint("punctuation.delimiter"),
      setState("line"),
      pushState(`blockHeader_${kind}_${n}`),
    ),
    on(
      "|>",
      byte("|>"),
      byte("+-"),
      literal(String(n)),
      headerEnd,
      paint("punctuation.delimiter"),
      setState("line"),
      pushState(`blockHeader_${kind}_${n}`),
    ),
  ]),
  on(
    "|>",
    byte("|>"),
    optional(byte("+-")),
    headerEnd,
    paint("punctuation.delimiter"),
    setState("line"),
    pushState(`blockHeader_${kind}_auto`),
  ),
];
for (const kind of ["zero", "indented"] as const)
  for (const n of ["auto", ...Array.from({ length: 9 }, (_, i) => String(i + 1))]) {
    blockStates[`blockHeader_${kind}_${n}`] = {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        token("#", "comment", pushState("comment")),
        token(
          "\n",
          "string",
          setState(n === "auto" ? `blockFirst_${kind}` : `blockLine_${kind}_${n}`),
        ),
      ],
    };
  }
// Tabs in indentation are not YAML indentation; indentTo nevertheless accepts them.
// Plain scalar continuation lines are not yet contextualized.
const syntax = (kind: "zero" | "indented", flow = false) => [
  on(" \t", bytes(" \t"), paint("plain")),
  ...(flow ? [token("\n", "plain")] : [token("\n", "plain", setState("line"))]),
  token("#", "comment", pushState("comment")),
  ...(flow
    ? []
    : [
        on(
          "-",
          literal("-"),
          lookahead(byte(" \t")),
          paint("punctuation.delimiter"),
          setState(kind === "zero" ? "sequenceZero" : "sequenceIndented"),
        ),
        on(
          "-",
          literal("-"),
          lookahead(choice([byte("\r\n")], [lineEnd()])),
          paint("punctuation.delimiter"),
        ),
      ]),
  ...["---", "..."].map((s) =>
    on(
      s[0]!,
      lineStart(),
      literal(s),
      lookahead(choice([byte(" \t\r\n")], [lineEnd()])),
      paint("punctuation.special"),
    ),
  ),
  on("%", lineStart(), literal("%"), bytes(except(all, "\r\n"), { min: 0 }), paint("attribute")),
  ...(flow ? [] : blockOpen(kind)),
  token(
    oneOf("[{"),
    "punctuation.bracket",
    pushState(kind === "zero" ? "flowZero" : "flowIndented"),
  ),
  ...(flow
    ? [token(oneOf("]}"), "punctuation.bracket", popState())]
    : [token(oneOf("]}"), "punctuation.bracket")]),
  on(
    "'",
    ...singleKey,
    lookahead(literal(":"), choice([byte(" \t\r\n")], [lineEnd()])),
    paint("property"),
  ),
  on(
    '"',
    ...doubleKey,
    lookahead(literal(":"), choice([byte(" \t\r\n")], [lineEnd()])),
    paint("property"),
  ),
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
  on("&*", byte("&*"), bytes(except(all, " \t\r\n,[]{}")), paint("label")),
  on("!", literal("!<"), bytes(except(all, ">\r\n"), { min: 0 }), literal(">"), paint("type")),
  on("!", literal("!"), bytes(except(all, " \t\r\n,[]{}"), { min: 0 }), paint("type")),
  token("<<", "property"),
  on(
    word,
    ...(flow ? plain : blockPlain),
    lookahead(literal(":"), choice([byte(" \t\r\n")], [lineEnd()])),
    paint("property"),
  ),
  numbers,
  on(
    word,
    ...(flow ? plain : blockPlain),
    classify(
      [
        ...keywordTable(
          ["null", "Null", "NULL", "~", "true", "True", "TRUE", "false", "False", "FALSE"],
          "constant.builtin",
        ),
        ...keywordTable([".inf", ".Inf", ".INF", ".nan", ".NaN", ".NAN"], "number"),
      ],
      [paint("string")],
    ),
  ),
  token(oneOf(",:?"), "punctuation.delimiter"),
];
export default defineGrammar({
  name: "yaml",
  aliases: ["yml"],
  initial: "line",
  states: {
    line: {
      style: "plain",
      arms: [
        on(
          " ",
          lineStart(),
          bytes(" "),
          saveColumn(parent),
          paint("plain"),
          setState("rootIndented"),
        ),
      ],
      otherwise: [setState("rootZero")],
    },
    sequenceZero: {
      style: "plain",
      arms: [
        on(
          " \t",
          bytes(" \t"),
          lookahead(choice([keyName, literal(":"), byte(" \t\r\n")], [literal("-"), byte(" \t")])),
          saveColumn(parent),
          paint("plain"),
          setState("rootIndented"),
        ),
        on(" \t", bytes(" \t"), paint("plain"), setState("rootZero")),
      ],
    },
    sequenceIndented: {
      style: "plain",
      arms: [
        on(
          " \t",
          bytes(" \t"),
          lookahead(choice([keyName, literal(":"), byte(" \t\r\n")], [literal("-"), byte(" \t")])),
          saveColumn(parent),
          paint("plain"),
          setState("rootIndented"),
        ),
        on(" \t", bytes(" \t"), paint("plain"), setState("rootIndented")),
      ],
    },
    rootZero: { style: "plain", arms: syntax("zero") },
    rootIndented: { style: "plain", arms: syntax("indented") },
    flowZero: { style: "plain", arms: syntax("zero", true) },
    flowIndented: { style: "plain", arms: syntax("indented", true) },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    single: {
      style: "string",
      arms: [token("''", "string.escape"), token("'", "string", popState())],
    },
    double: { style: "string", arms: [quotedEscape, token('"', "string", popState())] },
    ...blockStates,
  },
});
