import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
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
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const atom = except(all, " \t\r\n\v\f()[]\";'`,\\");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const alphanumeric = union(digit, range("a", "z"), range("A", "Z"));
const symbolEnd = union(atom, "\\");
const definitions = ["defun", "defmacro", "defsubst", "cl-defun", "cl-defmacro", "cl-defsubst"];
const keywords = [
  "and",
  "or",
  "if",
  "when",
  "unless",
  "cond",
  "let",
  "let*",
  "while",
  "progn",
  "prog1",
  "prog2",
  "quote",
  "function",
  "lambda",
  "interactive",
  "catch",
  "throw",
  "condition-case",
  "condition-case-unless-debug",
  "unwind-protect",
  "setq",
  "setq-default",
  "setf",
  "cl-setf",
  "pcase",
  "pcase-let",
  "pcase-let*",
  "pcase-lambda",
  "defvar",
  "defconst",
  "defcustom",
  "defgroup",
  "defface",
  "define-minor-mode",
  "define-derived-mode",
  "define-globalized-minor-mode",
  "define-keymap",
  "define-error",
  "cl-defstruct",
  "cl-defgeneric",
  "cl-defmethod",
  "cl-labels",
  "cl-flet",
  "cl-loop",
  "cl-block",
  "cl-return-from",
  "cl-case",
  "cl-typecase",
  "use-package",
  "save-excursion",
  "save-current-buffer",
  "save-restriction",
  "save-match-data",
  "with-current-buffer",
  "with-temp-buffer",
  "with-temp-file",
  "with-current-buffer-window",
  "with-selected-window",
  "with-silent-modifications",
  "with-demoted-errors",
  "with-eval-after-load",
  "eval-and-compile",
  "eval-when-compile",
  "dolist",
  "dotimes",
  "push",
  "pop",
  "declare",
  "declare-function",
  "autoload",
  "provide",
  "require",
  "ignore-errors",
];
const word = (head = false) =>
  on(
    atom,
    bytes(atom),
    notNext("\\"),
    classify(
      head
        ? [
            ...definitions.map((text) => ({
              text,
              then: [paint("keyword"), setState("definitionName")],
            })),
            ...keywordTable(keywords, "keyword").map(({ text, then }) => ({
              text,
              then: [...then, setState("list")],
            })),
            ...keywordTable(["nil", "t"], "constant.builtin").map(({ text, then }) => ({
              text,
              then: [...then, setState("list")],
            })),
          ]
        : keywordTable(["nil", "t"], "constant.builtin"),
      [paint(head ? "function" : "variable"), ...(head ? [setState("list")] : [])],
    ),
  );
const comments = [
  token(";;;###autoload", "comment", pushState("lineComment")),
  token(";", "comment", pushState("lineComment")),
];
const modifier = choice([literal("\\"), byte("CMSHAs"), literal("-")]);
const escape = choice(
  [literal("\\N{"), bytes(except(all, "}")), literal("}")],
  [repeat(modifier), literal("\\^"), character()],
  [repeat(modifier), literal("\\x"), bytes(hex)],
  [repeat(modifier), literal("\\u"), byte(hex), byte(hex), byte(hex), byte(hex)],
  [
    repeat(modifier),
    literal("\\U"),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
  ],
  [repeat(modifier), literal("\\"), bytes(range("0", "7"), { min: 1, max: 3 })],
  [repeat(modifier), literal("\\"), character()],
  [repeat(modifier), character()],
);
const number = (head = false) => {
  const exponent = choice(
    [byte("eE"), optional(byte("+-")), bytes(digit)],
    [byte("eE"), byte("+-"), choice([literal("INF")], [literal("NaN")])],
  );
  const decimal = choice(
    [bytes(digit), literal("."), bytes(digit, { min: 0 }), optional(exponent)],
    [literal("."), bytes(digit), optional(exponent)],
    [bytes(digit), exponent],
    [bytes(digit)],
  );
  // Radix prefixes #2r–#36r are bounded, but their digits are not checked against the radix.
  return on(
    union(digit, "+-.#"),
    choice(
      [literal("#"), byte("bB"), optional(byte("+-")), bytes(range("0", "1")), notNext(symbolEnd)],
      [literal("#"), byte("oO"), optional(byte("+-")), bytes(range("0", "7")), notNext(symbolEnd)],
      [literal("#"), byte("xX"), optional(byte("+-")), bytes(hex), notNext(symbolEnd)],
      [
        literal("#"),
        bytes("0", { min: 0 }),
        choice(
          [literal("3"), byte(range("0", "6"))],
          [byte("12"), byte(digit)],
          [byte(range("2", "9"))],
        ),
        byte("rR"),
        optional(byte("+-")),
        bytes(alphanumeric),
        notNext(symbolEnd),
      ],
      [optional(byte("+-")), decimal, notNext(symbolEnd)],
    ),
    paint("number"),
    ...(head ? [setState("list")] : []),
  );
};
const reader = [
  ...comments,
  token("#'", "punctuation.special"),
  on("#", literal("#"), byte("sS"), literal("("), paint("punctuation.bracket"), pushState("list")),
  on("#", literal("#&"), bytes(digit), paint("punctuation.special")),
  token("#@00", "comment", pushState("skipToEnd")),
  // Other #@N forms have a runtime byte count; their payload is not skipped.
  on("#", literal("#@"), bytes(digit), paint("punctuation.special")),
  on("#", literal("#"), bytes(digit), byte("=#"), paint("punctuation.special")),
  token("#$", "punctuation.special"),
  token("##", "constant.builtin"),
  token("#:", "punctuation.special"),
  number(),
  on("?", literal("?"), choice([escape], [character()]), paint("number")),
  token('"', "string", pushState("string")),
  on("\\", literal("\\"), character(), paint("variable")),
  token("(", "punctuation.bracket", pushState("head")),
  token("[", "punctuation.bracket", pushState("vector")),
  token(",@", "punctuation.special"),
  token(oneOf("'`,"), "punctuation.special"),
  token(":", "constant.builtin", pushState("keywordSymbol")),
];
export default defineGrammar({
  name: "elisp",
  aliases: ["emacs-lisp", "el"],
  initial: "root",
  states: {
    root: { style: "plain", arms: [...reader, word(), on(atom, bytes(atom), paint("variable"))] },
    list: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        ...reader,
        word(),
        on(atom, bytes(atom), paint("variable")),
      ],
    },
    vector: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        ...reader,
        word(),
        on(atom, bytes(atom), paint("variable")),
      ],
    },
    // List-head styling is lexical, including quoted forms and binding lists.
    head: {
      style: "plain",
      arms: [
        ...comments,
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        token(")", "punctuation.bracket", popState()),
        number(true),
        redispatch("#:?'`\",([\\", setState("list")),
        word(true),
        on(atom, bytes(atom), paint("variable"), setState("list")),
      ],
      otherwise: [setState("list")],
    },
    definitionName: {
      style: "plain",
      arms: [
        ...comments,
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        on(atom, bytes(atom), paint("function"), setState("definitionNameTail")),
        on("\\", literal("\\"), character(), paint("function"), setState("definitionNameTail")),
      ],
      otherwise: [setState("list")],
    },
    definitionNameTail: {
      style: "plain",
      arms: [
        on(atom, bytes(atom), paint("function")),
        on("\\", literal("\\"), character(), paint("function")),
      ],
      otherwise: [setState("list")],
    },
    keywordSymbol: {
      style: "plain",
      arms: [
        on(atom, bytes(atom), paint("constant.builtin")),
        on("\\", literal("\\"), character(), paint("constant.builtin")),
      ],
      otherwise: [popState()],
    },
    skipToEnd: { style: "comment", arms: [] },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: {
      style: "string",
      arms: [on("\\", escape, paint("string.escape")), token('"', "string", popState())],
    },
  },
});
