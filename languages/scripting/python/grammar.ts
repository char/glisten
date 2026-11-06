import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
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

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const keywords = ["False", "None", "True"];
const reserved = [
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
];
const builtins = [
  "abs",
  "aiter",
  "all",
  "anext",
  "any",
  "ascii",
  "bin",
  "bool",
  "breakpoint",
  "bytearray",
  "bytes",
  "callable",
  "chr",
  "classmethod",
  "compile",
  "complex",
  "delattr",
  "dict",
  "dir",
  "divmod",
  "enumerate",
  "eval",
  "exec",
  "filter",
  "float",
  "format",
  "frozenset",
  "getattr",
  "globals",
  "hasattr",
  "hash",
  "help",
  "hex",
  "id",
  "input",
  "int",
  "isinstance",
  "issubclass",
  "iter",
  "len",
  "list",
  "locals",
  "map",
  "max",
  "memoryview",
  "min",
  "next",
  "object",
  "oct",
  "open",
  "ord",
  "pow",
  "print",
  "property",
  "range",
  "repr",
  "reversed",
  "round",
  "set",
  "setattr",
  "slice",
  "sorted",
  "staticmethod",
  "str",
  "sum",
  "super",
  "tuple",
  "type",
  "vars",
  "zip",
  "__import__",
];
const digits = (set = digit) => [byte(set), repeat(optional(literal("_")), byte(set))];
const hex = union(digit, range("a", "f"), range("A", "F"));
const number = on(
  ".0123456789",
  choice(
    [literal("0"), byte("xX"), optional(literal("_")), ...digits(hex)],
    [literal("0"), byte("oO"), optional(literal("_")), ...digits("01234567")],
    [literal("0"), byte("bB"), optional(literal("_")), ...digits("01")],
    [
      choice(
        [...digits(), literal("."), optional(...digits())],
        [literal("."), ...digits()],
        [...digits()],
      ),
      optional(byte("eE"), optional(byte("+-")), ...digits()),
      optional(byte("jJ")),
    ],
  ),
  paint("number"),
);
const stringOpeners = ["'''", '"""', "'", '"'].flatMap((quote, index) => {
  const suffix = ["TripleSingle", "TripleDouble", "Single", "Double"][index];
  return [
    on(
      "fFrR",
      choice([byte("fF"), byte("rR")], [byte("rR"), byte("fF")]),
      literal(quote),
      paint("string"),
      pushState("rf" + suffix),
    ),
    on("fF", byte("fF"), literal(quote), paint("string"), pushState("f" + suffix)),
    on(
      "rRbB",
      choice([byte("rR"), optional(byte("bB"))], [byte("bB"), byte("rR")]),
      literal(quote),
      paint("string"),
      pushState("raw" + suffix),
    ),
    on("bBuU'\"", optional(byte("bBuU")), literal(quote), paint("string"), pushState("s" + suffix)),
  ];
});
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("\r\n")],
    [literal("x"), byte(hex), byte(hex)],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [literal("N{"), bytes(union(range("a", "z"), range("A", "Z"), digit, " -")), literal("}")],
    [byte("01234567"), bytes("01234567", { min: 0, max: 2 })],
    [byte("\\'\"abfnrtv\n")],
  ),
  paint("string.escape"),
);
const typeWord = on(
  start,
  ...ident,
  classify(keywordTable(keywords, "constant.builtin"), [paint("type")]),
);
const code = (end?: string, pattern = false) => [
  ...(end ? [token(end, "punctuation.bracket", popState())] : []),
  ...(pattern ? [on("_", literal("_"), notNext(rest), paint("keyword"))] : []),
  token("#", "comment", pushState("comment")),
  ...stringOpeners,
  number,
  on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    classify(
      [
        ...keywordTable(keywords, "constant.builtin"),
        ...keywordTable(reserved, "keyword"),
        ...keywordTable(builtins, "function"),
      ],
      [paint("function")],
    ),
  ),
  on(
    upper,
    byte(upper),
    bytes(union(upper, "_"), { min: 0 }),
    notNext(rest),
    paint("constant.builtin"),
  ),
  on(upper, ...ident, classify(keywordTable(keywords, "constant.builtin"), [paint("type")])),
  on(
    start,
    ...ident,
    classify(
      [
        ...keywordTable(keywords, "constant.builtin"),
        ...reserved.map((text) => ({
          text,
          then: [
            paint("keyword" as const),
            ...(text === "def"
              ? [pushState("functionName")]
              : text === "class"
                ? [pushState("className")]
                : []),
          ],
        })),
        ...keywordTable(["self", "cls"], "variable"),
      ],
      [paint("variable")],
    ),
  ),
  token("->", "operator", pushState("returnType")),
  token("(", "punctuation.bracket", pushState(pattern ? "patternParen" : "paren")),
  token("[", "punctuation.bracket", pushState(pattern ? "patternSquare" : "square")),
  token("{", "punctuation.bracket", pushState(pattern ? "patternBrace" : "brace")),
  ...["}", "]", ")"].map((s) => token(s, "punctuation.bracket")),
  token(".", "punctuation.delimiter", pushState("member")),
  ...[",", ":", ";"].map((s) => token(s, "punctuation.delimiter")),
  ...["+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~", "@"].map((s) =>
    token(s, "operator"),
  ),
];

export default defineGrammar<string>({
  name: "python",
  // Starlark (Bazel, Buck) is a Python dialect with the same lexical syntax.
  aliases: ["py", "python3", "starlark", "bzl", "bazel"],
  initial: "lineHead",
  states: {
    lineHead: {
      style: "plain",
      arms: [
        on(" \t\f", bytes(" \t\f"), paint("plain")),
        on(
          "m",
          literal("match"),
          notNext(rest),
          lookahead(
            bytes(" \t"),
            byte(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n:#")),
            bytes(except(byteSet({ ranges: [[0, 255]] }), ":\r\n#"), { min: 0 }),
            literal(":"),
          ),
          paint("keyword"),
          setState("root"),
        ),
        on(
          "c",
          literal("case"),
          notNext(rest),
          lookahead(
            bytes(" \t"),
            byte(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n:#")),
            bytes(except(byteSet({ ranges: [[0, 255]] }), ":\r\n#"), { min: 0 }),
            literal(":"),
          ),
          paint("keyword"),
          setState("casePattern"),
        ),
        on(
          "t",
          literal("type"),
          notNext(rest),
          lookahead(bytes(" \t"), ...ident, bytes(" \t", { min: 0 }), literal("=")),
          paint("keyword"),
          setState("root"),
        ),
        token("@", "function", setState("root"), pushState("decorator")),
      ],
      otherwise: [setState("root")],
    },
    root: { style: "plain", arms: [token("\n", "plain", setState("lineHead")), ...code()] },
    casePattern: {
      style: "plain",
      arms: [
        token(":", "punctuation.delimiter", setState("root")),
        on("i", literal("if"), notNext(rest), paint("keyword"), setState("root")),
        token("\n", "plain", setState("lineHead")),
        ...code(undefined, true),
      ],
    },
    decorator: {
      style: "plain",
      arms: [on(start, ...ident, paint("function")), token(".", "function")],
      otherwise: [popState()],
    },
    patternParen: { style: "plain", arms: code(")", true) },
    patternSquare: { style: "plain", arms: code("]", true) },
    patternBrace: { style: "plain", arms: code("}", true) },
    paren: { style: "plain", arms: code(")") },
    square: { style: "plain", arms: code("]") },
    brace: { style: "plain", arms: code("}") },
    field: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token(":", "punctuation.special", pushState("format")),
        token("!r", "punctuation.special"),
        token("!s", "punctuation.special"),
        token("!a", "punctuation.special"),
        ...code(),
      ],
    },
    format: {
      style: "string",
      arms: [
        token("{", "punctuation.special", pushState("field")),
        token("}", "punctuation.special", popState(), popState()),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    functionName: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, paint("function"), setState("defHead")),
      ],
      otherwise: [popState()],
    },
    defHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("(", "punctuation.bracket", setState("parameters")),
      ],
      otherwise: [popState()],
    },
    parameters: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        token(":", "punctuation.delimiter", pushState("parameterType")),
        ...code(),
      ],
    },
    parameterType: {
      style: "plain",
      arms: [
        redispatch(",=)\n", popState()),
        typeWord,
        token("[", "punctuation.bracket", pushState("typeBracket")),
        token("(", "punctuation.bracket", pushState("typeParen")),
        ...code(),
      ],
    },
    returnType: {
      style: "plain",
      arms: [
        redispatch(":\n", popState()),
        typeWord,
        token("[", "punctuation.bracket", pushState("typeBracket")),
        token("(", "punctuation.bracket", pushState("typeParen")),
        ...code(),
      ],
    },
    typeBracket: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        typeWord,
        token("[", "punctuation.bracket", pushState("typeBracket")),
        token("(", "punctuation.bracket", pushState("typeParen")),
        ...code(),
      ],
    },
    typeParen: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        typeWord,
        token("[", "punctuation.bracket", pushState("typeBracket")),
        token("(", "punctuation.bracket", pushState("typeParen")),
        ...code(),
      ],
    },
    member: {
      style: "plain",
      arms: [
        on(
          start,
          ...ident,
          lookahead(bytes(" \t", { min: 0 }), literal("(")),
          paint("function"),
          popState(),
        ),
        on(start, ...ident, paint("property"), popState()),
      ],
      otherwise: [popState()],
    },
    className: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    ...Object.fromEntries(
      ["'''", '"""', "'", '"'].flatMap((quote, index) => {
        const suffix = ["TripleSingle", "TripleDouble", "Single", "Double"][index];
        return ["s", "f", "raw", "rf"].map((kind) => [
          kind + suffix,
          {
            style: "string" as const,
            arms: [
              ...(kind === "raw" || kind === "rf"
                ? [
                    on(
                      "\\",
                      literal("\\"),
                      choice([literal("\r\n")], [byte(union("\\\r\n", quote.charAt(0)))]),
                      paint("string"),
                    ),
                  ]
                : [escape]),
              ...(kind === "f" || kind === "rf"
                ? [
                    token("{{", "string.escape"),
                    token("}}", "string.escape"),
                    token("{", "punctuation.special", pushState("field")),
                  ]
                : []),
              token(quote, "string", popState()),
              ...(quote.length === 1 ? [redispatch("\r\n", popState())] : []),
            ],
          },
        ]);
      }),
    ),
  },
});
