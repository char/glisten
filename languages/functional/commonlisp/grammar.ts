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
const atom = except(all, " \t\r\n\v\f()\";'`,|\\");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const alphaNumeric = union(digit, range("a", "z"), range("A", "Z"));
const keywords = `
  block catch eval-when flet function go if labels let let* load-time-value locally macrolet
  multiple-value-call multiple-value-prog1 progn progv quote return-from setq symbol-macrolet
  tagbody the throw unwind-protect lambda cond case ecase ccase typecase etypecase ctypecase when
  unless and or prog prog* prog1 prog2 return do do* dolist dotimes do-symbols do-external-symbols
  do-all-symbols defvar defparameter defconstant defclass define-condition defpackage in-package
  deftype defstruct defsetf define-modify-macro define-symbol-macro define-method-combination
  handler-case handler-bind restart-case restart-bind ignore-errors unwind-protect multiple-value-bind multiple-value-setq multiple-value-list nth-value destructuring-bind with-open-file with-open-stream with-input-from-string with-output-to-string with-accessors with-slots with-standard-io-syntax with-hash-table-iterator with-package-iterator with-simple-restart with-compilation-unit with-condition-restarts setf psetf psetq rotatef shiftf remf check-type assert
  time step incf decf push pop pushnew declare declaim proclaim eval-when otherwise t nil
`
  .trim()
  .split(/\s+/);
const uniqueKeywords = [...new Set(keywords.filter((word) => word !== "t" && word !== "nil"))];
const definitions = `
  defun defmacro defgeneric defmethod define-compiler-macro define-setf-expander
`
  .trim()
  .split(/\s+/);
const loopWords = `
  for as in on across of-type from upfrom downfrom to upto downto below above by being each the
  using hash-key hash-keys hash-value hash-values with initially finally do doing return collect
  collecting append appending nconc nconcing count counting sum summing maximize maximizing
  minimize minimizing into if when unless else end while until repeat always never thereis and
`
  .trim()
  .split(/\s+/);
const symbolEnd = union(atom, "|\\");
const featureName = repeat(
  choice(
    [bytes(atom)],
    [literal("\\"), character()],
    [
      literal("|"),
      repeat(choice([literal("\\"), character()], [byte(except(all, "|\\"))])),
      literal("|"),
    ],
  ),
);
const word = (context: "head" | "list" | "loop" = "list") =>
  on(
    atom,
    bytes(atom),
    notNext("|\\"),
    classify(
      context === "head"
        ? [
            ...definitions.map((text) => ({
              text,
              then: [paint("keyword"), setState("definitionName")],
            })),
            { text: "loop", then: [paint("keyword"), setState("loop")] },
            ...keywordTable(uniqueKeywords, "keyword").map(({ text, then }) => ({
              text,
              then: [...then, setState("list")],
            })),
            ...keywordTable(["t", "nil"], "constant.builtin").map(({ text, then }) => ({
              text,
              then: [...then, setState("list")],
            })),
          ]
        : [
            ...(context === "loop" ? keywordTable(loopWords, "keyword") : []),
            ...keywordTable(["t", "nil"], "constant.builtin"),
          ],
      [
        paint(context === "head" ? "function" : "variable"),
        ...(context === "head" ? [setState("list")] : []),
      ],
      { caseless: true },
    ),
  );
const comments = [
  token("#|", "comment", pushState("blockComment")),
  token(";", "comment", pushState("lineComment")),
];
const number = (context: "head" | "list" = "list") => {
  const exponent = choice([byte("eEsSfFdDlL"), optional(byte("+-")), bytes(digit)]);
  const real = choice(
    [bytes(digit), literal("/"), bytes(digit)],
    [bytes(digit), literal("."), bytes(digit, { min: 0 }), optional(exponent)],
    [literal("."), bytes(digit), optional(exponent)],
    [bytes(digit), exponent],
    [bytes(digit)],
  );
  const radix = (digits: typeof digit) =>
    choice(
      [optional(byte("+-")), bytes(digits), literal("/"), bytes(digits), notNext(symbolEnd)],
      [optional(byte("+-")), bytes(digits), notNext(symbolEnd)],
    );
  // #nR validates the radix's range but not whether its digits are below that radix.
  return on(
    union(digit, "+-.#"),
    choice(
      [literal("#"), byte("bB"), radix(range("0", "1"))],
      [literal("#"), byte("oO"), radix(range("0", "7"))],
      [literal("#"), byte("xX"), radix(hex)],
      [
        literal("#"),
        choice(
          [literal("3"), byte(range("0", "6"))],
          [byte("12"), byte(digit)],
          [byte(range("2", "9"))],
        ),
        byte("rR"),
        radix(alphaNumeric),
      ],
      [optional(byte("+-")), real, notNext(symbolEnd)],
    ),
    paint("number"),
    ...(context === "head" ? [setState("list")] : []),
  );
};
// Character names and code points are colored without validating their repertoire.
const reader = [
  ...comments,
  token("#+", "punctuation.special", pushState("feature")),
  token("#-", "punctuation.special", pushState("feature")),
  on("#", literal("#\\"), character(), bytes(atom, { min: 0 }), paint("constant.builtin")),
  on("#", literal("#*"), bytes("01", { min: 0 }), notNext(symbolEnd), paint("constant.builtin")),
  on("#", literal("#"), byte("pP"), literal('"'), paint("string"), pushState("string")),
  on("#", literal("#"), bytes(digit), byte("aA"), paint("punctuation.special")),
  token("#(", "punctuation.bracket", pushState("list")),
  ...["#'", "#.", "#:", "#C", "#c"].map((s) => token(s, "punctuation.special")),
  number(),
  token('"', "string", pushState("string")),
  token("|", "variable", pushState("symbol")),
  on("\\", literal("\\"), character(), paint("variable")),
  token("(", "punctuation.bracket", pushState("head")),
  token(",@", "punctuation.special"),
  token(oneOf("'`,"), "punctuation.special"),
  on(
    ":",
    literal(":"),
    bytes(atom, { min: 0 }),
    literal("|"),
    paint("constant.builtin"),
    pushState("keywordSymbol"),
  ),
  on(":", literal(":"), bytes(atom, { min: 0 }), paint("constant.builtin")),
];
export default defineGrammar({
  name: "commonlisp",
  extensions: ["lisp", "lsp", "cl", "asd"],
  aliases: ["lisp", "cl", "lsp"],
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
    // Head and LOOP clause styling is lexical, including quoted forms and shadowed names;
    // package-qualified LOOP keywords are not recognized.
    head: {
      style: "plain",
      arms: [
        ...comments,
        token("#+", "punctuation.special", pushState("feature")),
        token("#-", "punctuation.special", pushState("feature")),
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        token(")", "punctuation.bracket", popState()),
        number("head"),
        redispatch("#:'`\",(|\\", setState("list")),
        word("head"),
        on(atom, bytes(atom), paint("variable"), setState("list")),
      ],
      otherwise: [setState("list")],
    },
    loop: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        on(
          ":",
          literal(":"),
          bytes(atom, { min: 0 }),
          notNext("|\\"),
          classify(
            keywordTable(
              loopWords.map((word) => `:${word}`),
              "keyword",
            ),
            [paint("constant.builtin")],
            { caseless: true },
          ),
        ),
        ...reader,
        word("loop"),
        on(atom, bytes(atom), paint("variable")),
      ],
    },
    // A name combining escaped and unescaped components may be split across styles.
    definitionName: {
      style: "plain",
      arms: [
        ...comments,
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        token("|", "function", setState("list"), pushState("definitionSymbol")),
        on(atom, bytes(atom), paint("function"), setState("list")),
        token("(", "punctuation.bracket", setState("list"), pushState("definitionNameList")),
      ],
      otherwise: [setState("list")],
    },
    definitionNameList: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        on(atom, bytes(atom), paint("function")),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("#|", "comment", pushState("blockComment")), token("|#", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    keywordSymbol: {
      style: "constant.builtin",
      arms: [
        on("\\", literal("\\"), character(), paint("constant.builtin")),
        token("|", "constant.builtin", popState()),
      ],
    },
    definitionSymbol: {
      style: "function",
      arms: [
        on("\\", literal("\\"), character(), paint("function")),
        token("|", "function", popState()),
      ],
    },
    symbol: {
      style: "variable",
      arms: [
        on("\\", literal("\\"), character(), paint("variable")),
        token("|", "variable", popState()),
      ],
    },
    // Reader conditionals color the feature expression without evaluating it; the form follows normally.
    feature: {
      style: "plain",
      arms: [
        ...comments,
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        token("(", "punctuation.bracket", setState("featureList")),
        on(symbolEnd, featureName, paint("attribute"), popState()),
      ],
    },
    featureList: {
      style: "plain",
      arms: [
        ...comments,
        token("(", "punctuation.bracket", pushState("featureList")),
        token(")", "punctuation.bracket", popState()),
        on(symbolEnd, featureName, paint("attribute")),
      ],
    },
  },
});
