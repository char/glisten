import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  matchRun,
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
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const high = byteSet({ ranges: [[128, 255]] });
const start = union(lower, upper, "_", high);
const rest = union(start, digit, "'");
const name = [byte(start), bytes(rest, { min: 0 })];
const op = "!#$%&*+./<=>?@\\^|-~:";
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = (set = digit) => [bytes(set), repeat(literal("_"), bytes(set))];
const hashes = slot.run("raw-hashes", { scope: "frame" });
const keywords =
  "module import as public export private data record constructor interface implementation where let in case of if then else do with rewrite impossible total partial covering mutual namespace parameters using auto default failing infix infixl infixr prefix implicit proof forall typebind autobind open".split(
    " ",
  );
const modifiers = new Set("public export private total partial covering".split(" "));
const words = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["Type", "Type0"], "type"),
  ...keywordTable(["True", "False"], "constant.builtin"),
];
const bolWords = words.map(({ text, then }) => ({
  text,
  then: modifiers.has(text) ? then : [...then, setState("root")],
}));
const lineComment = on(
  "-",
  literal("--"),
  bytes("-", { min: 0 }),
  notNext("}"),
  paint("comment"),
  pushState("lineComment"),
);
const docComment = token("|||", "comment", pushState("lineComment"));
const emptyBlock = on("{", literal("{"), bytes("-"), literal("}"), paint("comment"));
const blockComment = on(
  "{",
  literal("{-"),
  bytes("-", { min: 0 }),
  paint("comment"),
  pushState("blockComment"),
);
const escapedChar = choice(
  [literal("x"), bytes(hex)],
  [literal("o"), bytes("01234567")],
  [bytes(digit)],
  [bytes(union(upper, digit))],
  [character()],
);
const charBody = choice([literal("\\"), escapedChar], [notNext("'"), character()]);
const escape = on("\\", literal("\\"), escapedChar, paint("string.escape"));
const char = on("'", literal("'"), charBody, literal("'"), paint("string"));
const rawOpen = on(
  "#",
  bytes("#"),
  lookahead(literal('"')),
  paint("string"),
  pushState("rawOpen"),
  saveRun(hashes),
);
const multilineStart = on(
  '"',
  literal('"""'),
  lookahead(bytes(" \t\r", { min: 0 }), literal("\n")),
  paint("string"),
  pushState("multiline"),
);
const rawInterpolation = on(
  "\\",
  literal("\\"),
  matchRun(hashes, { relation: "prefix" }),
  literal("{"),
  paint("punctuation.special"),
  pushState("interpolation"),
);
const rawEscape = on(
  "\\",
  literal("\\"),
  matchRun(hashes, { relation: "prefix" }),
  escapedChar,
  paint("string.escape"),
);
const interpolation = token("\\{", "punctuation.special", pushState("interpolation"));
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), ...digits(hex)],
    [literal("0"), byte("oO"), ...digits("01234567")],
    [literal("0b"), ...digits("01")],
    [
      ...digits(),
      optional(literal("."), bytes(digit)),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    ],
  ),
  paint("number"),
);
const symbols = ["→", "←", "⇒", "⇐", "λ", "∀"].map((s) => token(s, "operator"));
const code = [
  lineComment,
  docComment,
  emptyBlock,
  blockComment,
  rawOpen,
  multilineStart,
  token('"', "string", pushState("string")),
  char,
  on("%", literal("%"), ...name, paint("attribute")),
  on("?", literal("?"), ...name, paint("label")),
  number,
  ...symbols,
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;`"), "punctuation.delimiter"),
  on(upper, ...name, classify(words, [paint("type")])),
  on(start, ...name, classify(words, [paint("variable")])),
  on(op, bytes(op), paint("operator")),
];
// Raw hash counts are frame-scoped so strings nested in interpolations cannot overwrite them.
export default defineGrammar({
  name: "idris",
  aliases: ["idr", "idris2"],
  initial: "bol",
  states: {
    bol: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        lineComment,
        docComment,
        emptyBlock,
        blockComment,
        on(
          start,
          ...name,
          lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(op)),
          classify(
            words.map(({ text, then }) => ({ text, then: [...then, setState("root")] })),
            [paint("function"), setState("root")],
          ),
        ),
        on(upper, ...name, classify(bolWords, [paint("type"), setState("root")])),
        on(start, ...name, classify(bolWords, [paint("variable"), setState("root")])),
      ],
      otherwise: [setState("root")],
    },
    root: {
      style: "plain",
      arms: [on("\r\n", byte("\r\n"), paint("plain"), setState("bol")), ...code],
    },
    interpolation: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("interpolationBrace")),
        ...code,
      ],
    },
    interpolationBrace: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("interpolationBrace")),
        ...code,
      ],
    },
    rawOpen: {
      style: "string",
      arms: [
        on(
          '"',
          literal('"""'),
          lookahead(bytes(" \t\r", { min: 0 }), literal("\n")),
          paint("string"),
          setState("rawMultiline"),
        ),
        token('"', "string", setState("rawString")),
      ],
      otherwise: [popState()],
    },
    rawString: {
      style: "string",
      arms: [
        rawInterpolation,
        rawEscape,
        on(
          '"',
          literal('"'),
          matchRun(hashes, { relation: "prefix" }),
          notNext('"'),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawMultiline: {
      style: "string",
      arms: [
        rawInterpolation,
        rawEscape,
        on(
          '"',
          literal('"""'),
          matchRun(hashes, { relation: "prefix" }),
          paint("string"),
          popState(),
        ),
      ],
    },
    string: { style: "string", arms: [interpolation, escape, token('"', "string", popState())] },
    multiline: {
      style: "string",
      arms: [interpolation, escape, token('"""', "string", popState())],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [
        emptyBlock,
        blockComment,
        on("-", bytes("-"), literal("}"), paint("comment"), popState()),
        lineComment,
        on("'", literal("'"), charBody, literal("'"), paint("comment")),
        token('"', "comment", pushState("blockString")),
      ],
    },
    blockString: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"', "comment", popState()),
      ],
    },
  },
});
