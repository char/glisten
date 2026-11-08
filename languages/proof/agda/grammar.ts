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
  notLookahead,
  on,
  oneOf,
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

const reserved = new Set([...'.;{}()@"'].map((c) => c.charCodeAt(0)));
const asciiName = byteSet({
  bytes: Array.from({ length: 128 }, (_, i) => i).filter(
    (i) => !reserved.has(i) && ![9, 10, 11, 12, 13, 32].includes(i),
  ),
});
const high = byteSet({ ranges: [[128, 255]] });
const start = union(asciiName, high);
const unicodeSpace = choice(
  [byte(byteSet({ bytes: [0xc2] })), byte(byteSet({ bytes: [0x85, 0xa0] }))],
  [literal("\u1680")],
  [
    byte(byteSet({ bytes: [0xe2] })),
    byte(byteSet({ bytes: [0x80] })),
    byte(byteSet({ ranges: [[0x80, 0x8a]], bytes: [0xa8, 0xa9, 0xaf] })),
  ],
  [literal("\u205f")],
  [literal("\u3000")],
);
const nameChars = choice(
  [bytes(asciiName)],
  [lookahead(byte(high)), notLookahead(unicodeSpace), character()],
);
const name = [nameChars, repeat(nameChars)];
const boundary = notLookahead(nameChars);
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const digits = (set = digit) => [bytes(set), repeat(literal("_"), bytes(set))];
const exponent = [byte("eE"), optional(byte("+-")), bytes(digit)];
const numeric = choice(
  [optional(literal("-")), ...digits(), literal("."), bytes(digit), optional(...exponent)],
  [optional(literal("-")), bytes(digit), ...exponent],
  [optional(literal("-")), literal("0x"), ...digits(hex)],
  [optional(literal("-")), literal("0b"), ...digits("01")],
  [optional(literal("-")), ...digits()],
);
const number = on(union(digit, "-"), numeric, boundary, paint("number"));
const char = on(
  "'",
  literal("'"),
  choice(
    [
      literal("\\"),
      choice(
        [byte("xX"), bytes(hex)],
        [bytes(union(range("a", "z"), range("A", "Z")))],
        [character()],
      ),
    ],
    [character()],
  ),
  literal("'"),
  boundary,
  paint("string"),
);
const space = " \t\r\n\v\f";
const lineComment = on("-", literal("--"), boundary, paint("comment"), pushState("lineComment"));
const blockComment = token("{-", "comment", pushState("blockComment"));
const pragma = token("{-#", "keyword", pushState("pragma"));
const hole = token("{!", "constant.builtin", pushState("hole"));
const keywords = `
  module open import using hiding renaming to public data record field constructor eta-equality
  no-eta-equality where with rewrite let in postulate primitive abstract private instance mutual
  infix infixl infixr syntax pattern macro quote quoteTerm unquote unquoteDecl unquoteDef tactic
  variable opaque unfolding forall codata coinductive inductive interleaved overlap do
`
  .trim()
  .split(/\s+/);
const words = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable([":", "=", "→", "->", "λ", "\\", "∀", "|"], "operator"),
  ...keywordTable(["?"], "constant.builtin"),
  ...keywordTable(["Set", "Prop", "Setω"], "type"),
];
const levels = choice([
  byte(byteSet({ bytes: [0xe2] })),
  byte(byteSet({ bytes: [0x82] })),
  byte(byteSet({ ranges: [[0x80, 0x89]] })),
]);
const universe = on("S", literal("Set"), levels, repeat(levels), boundary, paint("type"));
const headWords = words.map(({ text, then }) => ({ text, then: [...then, setState("root")] }));
const string = token('"', "string", pushState("string"));
// Names consume every non-reserved, non-whitespace character before classification.
export default defineGrammar({
  name: "agda",
  initial: "bol",
  states: {
    bol: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        pragma,
        hole,
        blockComment,
        lineComment,
        number,
        char,
        universe,
        on(
          start,
          ...name,
          lookahead(
            repeat(bytes(" \t"), notLookahead(literal(":"), boundary), ...name),
            bytes(" \t"),
            literal(":"),
            boundary,
          ),
          classify(headWords, [paint("function"), setState("signature")]),
        ),
      ],
      otherwise: [setState("root")],
    },
    signature: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(":", literal(":"), boundary, paint("operator"), setState("root")),
        on(start, ...name, paint("function")),
      ],
      otherwise: [setState("root")],
    },
    root: {
      style: "plain",
      arms: [
        on(" \t\v\f", bytes(" \t\v\f"), paint("plain")),
        on("\r\n", byte("\r\n"), paint("plain"), setState("bol")),
        pragma,
        hole,
        blockComment,
        lineComment,
        string,
        number,
        char,
        universe,
        token(oneOf("(){}"), "punctuation.bracket"),
        token(";", "punctuation.delimiter", setState("bol")),
        token(oneOf(".@"), "punctuation.delimiter"),
        on(start, ...name, classify(words, [paint("variable")])),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: { style: "comment", arms: [blockComment, token("-}", "comment", popState())] },
    pragma: { style: "keyword", arms: [token("#-}", "keyword", popState())] },
    hole: { style: "constant.builtin", arms: [token("!}", "constant.builtin", popState())] },
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
  },
});
