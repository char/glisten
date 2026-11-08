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
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const atom = except(all, " \t\r\n\v\f()[]\";'`,|");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const keywords = `
  define define-values define-syntax define-record-type define-library lambda λ case-lambda let
  let* letrec letrec* let-values let*-values let-syntax letrec-syntax if cond case else => when
  unless do begin quote quasiquote unquote unquote-splicing quote-splicing set! syntax-rules
  syntax-case identifier-syntax assert syntax quasisyntax unsyntax unsyntax-splicing guard import
  export rename only except prefix library include include-ci cond-expand parameterize and or
  delay delay-force
`
  .trim()
  .split(/\s+/);
// The upstream tree-sitter-scheme query's function.builtin names.
const builtins = `
  caar cadr call-with-input-file call-with-output-file cdar cddr list open-input-file
  open-output-file with-input-from-file with-output-to-file * + - / < <= = > >= abs acos angle
  append apply asin assoc assq assv atan boolean? caaaar caaadr caaar caadar caaddr caadr cadaar
  cadadr cadar caddar cadddr caddr call-with-current-continuation call-with-values car cdaaar
  cdaadr cdaar cdadar cdaddr cdadr cddaar cddadr cddar cdddar cddddr cdddr cdr ceiling
  char->integer char-alphabetic? char-ci<=? char-ci<? char-ci=? char-ci>=? char-ci>? char-downcase
  char-lower-case? char-numeric? char-ready? char-upcase char-upper-case? char-whitespace? char<=?
  char<? char=? char>=? char>? char? close-input-port close-output-port complex? cons cos
  current-error-port current-input-port current-output-port denominator display dynamic-wind
  eof-object? eq? equal? eqv? eval even? exact->inexact exact? exp expt floor flush-output
  for-each force gcd imag-part inexact->exact inexact? input-port? integer->char integer?
  interaction-environment lcm length list->string list->vector list-ref list-tail list? load log
  magnitude make-polar make-rectangular make-string make-vector map max member memq memv min
  modulo negative? newline not null-environment null? number->string number? numerator odd?
  output-port? pair? peek-char positive? procedure? quotient rational? rationalize read read-char
  real-part real? remainder reverse round scheme-report-environment set-car! set-cdr! sin sqrt
  string string->list string->number string->symbol string-append string-ci<=? string-ci<?
  string-ci=? string-ci>=? string-ci>? string-copy string-fill! string-length string-ref
  string-set! string<=? string<? string=? string>=? string>? string? substring symbol->string
  symbol? tan transcript-off transcript-on truncate values vector vector->list vector-fill!
  vector-length vector-ref vector-set! vector? write write-char zero?
`
  .trim()
  .split(/\s+/);
const headCases = [...keywordTable(keywords, "keyword"), ...keywordTable(builtins, "function")].map(
  ({ text, then }) => ({
    text,
    then: [...then, setState("list")],
  }),
);
const directives = on(
  "#",
  choice(
    [literal("#!fold-case")],
    [literal("#!no-fold-case")],
    [literal("#!r6rs")],
    [literal("#!r7rs")],
  ),
  notNext(atom),
  paint("comment"),
);
const comments = [
  directives,
  token("#|", "comment", pushState("blockComment")),
  token("#;", "comment", pushState("datumComment")),
  token(";", "comment", pushState("lineComment")),
];
// Character names and decoded Unicode scalar ranges are not validated.
const characterLiteral = on(
  "#",
  literal("#\\"),
  character(),
  bytes(atom, { min: 0 }),
  paint("constant.builtin"),
);
const exactness = choice([literal("#"), byte("eEiI")]);
const number = (context: "head" | "list" = "list") =>
  (
    [
      ["bB", range("0", "1"), false],
      ["oO", range("0", "7"), false],
      ["dD", digit, true],
      ["xX", hex, false],
    ] as const
  ).map(([radix, digits, decimal]) => {
    const radixPrefix = choice([literal("#"), byte(radix)]);
    const prefix = decimal
      ? optional(choice([radixPrefix, optional(exactness)], [exactness, optional(radixPrefix)]))
      : choice([radixPrefix, optional(exactness)], [exactness, radixPrefix]);
    const exponent = choice([byte("eEsSfFdDlL"), optional(byte("+-")), bytes(digit)]);
    const unsigned = decimal
      ? choice(
          [bytes(digits), literal("/"), bytes(digits)],
          [bytes(digits), literal("."), bytes(digits, { min: 0 }), optional(exponent)],
          [literal("."), bytes(digits), optional(exponent)],
          [bytes(digits), exponent],
          [bytes(digits)],
        )
      : choice([bytes(digits), literal("/"), bytes(digits)], [bytes(digits)]);
    const inf = choice(
      [byte("iI"), byte("nN"), byte("fF"), literal(".0")],
      [byte("nN"), byte("aA"), byte("nN"), literal(".0")],
    );
    const real = choice([byte("+-"), inf], [optional(byte("+-")), unsigned]);
    const signedImaginary = choice([byte("+-"), choice([inf], [unsigned])]);
    // Each alternative checks the atom boundary before committing: matchers are possessive.
    const body = choice(
      [real, literal("@"), real, notNext(atom)],
      [real, signedImaginary, byte("iI"), notNext(atom)],
      [real, byte("+-"), byte("iI"), notNext(atom)],
      [signedImaginary, byte("iI"), notNext(atom)],
      [byte("+-"), byte("iI"), notNext(atom)],
      [real, notNext(atom)],
    );
    return on(
      union(digit, "+-.#"),
      prefix,
      body,
      paint("number"),
      ...(context === "head" ? [setState("list")] : []),
    );
  });
const booleanLiteral = on(
  "#",
  literal("#"),
  choice(
    [byte("tT"), byte("rR"), byte("uU"), byte("eE")],
    [byte("fF"), byte("aA"), byte("lL"), byte("sS"), byte("eE")],
    [byte("tTfF")],
  ),
  notNext(atom),
  paint("constant.builtin"),
);
const atomWord = on(atom, bytes(atom), paint("variable"));
const syntax = [
  ...comments,
  token("#u8(", "punctuation.bracket", pushState("list")),
  token("#vu8(", "punctuation.bracket", pushState("list")),
  token("#(", "punctuation.bracket", pushState("list")),
  characterLiteral,
  booleanLiteral,
  ...number(),
  token('"', "string", pushState("string")),
  token("|", "variable", pushState("symbol")),
  token(oneOf("(["), "punctuation.bracket", pushState("head")),
  token("#,@", "punctuation.special"),
  ...["#'", "#`", "#,"].map((prefix) => token(prefix, "punctuation.special")),
  token(",@", "punctuation.special"),
  token(oneOf("'`,"), "punctuation.special"),
  atomWord,
];
const skipList = [
  token("#|", "comment", pushState("blockComment")),
  token("#;", "comment"),
  token(";", "comment", pushState("lineComment")),
  token("#\\", "comment", pushState("commentCharacter")),
  token('"', "comment", pushState("commentString")),
  token("|", "comment", pushState("commentSymbol")),
  token(oneOf("(["), "comment", pushState("commentList")),
  token(oneOf(")]"), "comment", popState()),
];
export default defineGrammar({
  name: "scheme",
  extensions: ["scm", "ss", "sld"],
  aliases: ["scm", "ss", "sld"],
  initial: "root",
  states: {
    root: { style: "plain", arms: syntax },
    list: {
      style: "plain",
      arms: [token(oneOf(")]"), "punctuation.bracket", popState()), ...syntax],
    },
    // List-head styling is lexical, including quoted lists and binding lists.
    head: {
      style: "plain",
      arms: [
        ...comments,
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("plain")),
        token(oneOf(")]"), "punctuation.bracket", popState()),
        ...number("head"),
        redispatch(union(digit, "#"), setState("list")),
        on(atom, bytes(atom), classify(headCases, [paint("function"), setState("list")])),
      ],
      otherwise: [setState("list")],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("#|", "comment", pushState("blockComment")), token("|#", "comment", popState())],
    },
    // Other escapes are colored as two-character units without validating them;
    // line-continuation whitespace is limited to ASCII spaces and tabs.
    string: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          bytes(" \t", { min: 0 }),
          choice([literal("\r\n")], [byte("\r\n")]),
          bytes(" \t", { min: 0 }),
          paint("string.escape"),
        ),
        on("\\", literal("\\x"), bytes(hex), literal(";"), paint("string.escape")),
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    symbol: {
      style: "variable",
      arms: [
        on("\\", literal("\\x"), bytes(hex), literal(";"), paint("string.escape")),
        on("\\", literal("\\"), character(), paint("string.escape")),
        token("|", "variable", popState()),
      ],
    },
    datumComment: {
      style: "comment",
      arms: [
        directives,
        token("#|", "comment", pushState("blockComment")),
        token("#;", "comment", pushState("datumComment")),
        token(";", "comment", pushState("lineComment")),
        on(" \t\r\n\v\f", bytes(" \t\r\n\v\f"), paint("comment")),
        token("#,@", "comment"),
        ...["#'", "#`", "#,"].map((prefix) => token(prefix, "comment")),
        on("#", literal("#"), bytes(digit), literal("="), paint("comment")),
        token(",@", "comment"),
        token(oneOf("'`,"), "comment"),
        token("#\\", "comment", setState("commentCharacter")),
        token("#u8(", "comment", setState("commentList")),
        token("#vu8(", "comment", setState("commentList")),
        token("#(", "comment", setState("commentList")),
        token(oneOf("(["), "comment", setState("commentList")),
        token('"', "comment", setState("commentString")),
        token("|", "comment", setState("commentSymbol")),
        on(atom, bytes(atom), paint("comment"), popState()),
      ],
    },
    commentList: { style: "comment", arms: skipList },
    commentCharacter: {
      style: "comment",
      arms: [on(all, character(), bytes(atom, { min: 0 }), paint("comment"), popState())],
    },
    commentString: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"', "comment", popState()),
      ],
    },
    commentSymbol: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token("|", "comment", popState()),
      ],
    },
  },
});
