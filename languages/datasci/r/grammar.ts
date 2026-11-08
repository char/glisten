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

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const letter = union(range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(letter, digit, "._");
const identifier = choice(
  [byte(letter), bytes(rest, { min: 0 })],
  [literal("."), notNext(digit), bytes(rest, { min: 0 })],
);
const quotedName = [
  literal("`"),
  repeat(choice([literal("\\"), character()], [byte(except(all, "`\\"))])),
  literal("`"),
];
const whitespace = bytes(" \t\r\n", { min: 0 });
const keywordCases = [
  ...keywordTable(
    `
      function if else for while repeat break next return in
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(
    `
      TRUE FALSE T F NULL NA NA_integer_ NA_real_ NA_complex_ NA_character_ Inf NaN ...
    `
      .trim()
      .split(/\s+/),
    "constant.builtin",
  ),
];
const word = (style: "variable" | "function" | "property") =>
  classify(keywordCases, [paint(style)]);
const dashes = slot.run("rawDashes");
const hex = union(digit, range("a", "f"), range("A", "F"));
const exponent = choice([byte("eE"), optional(byte("+-")), bytes(digit)]);
const binaryExponent = choice([byte("pP"), optional(byte("+-")), bytes(digit)]);
const number = on(
  union(digit, "."),
  choice(
    [
      literal("0"),
      byte("xX"),
      choice(
        [bytes(hex), optional(literal("."), bytes(hex, { min: 0 }))],
        [literal("."), bytes(hex)],
      ),
      optional(binaryExponent),
      optional(byte("Li")),
      notNext(rest),
    ],
    [
      choice(
        [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
        [literal("."), bytes(digit)],
      ),
      optional(exponent),
      optional(byte("Li")),
      notNext(rest),
    ],
  ),
  paint("number"),
);
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte("uU"), literal("{"), bytes(hex), literal("}")],
    [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)],
    [
      literal("U"),
      byte(hex),
      byte(hex),
      byte(hex),
      byte(hex),
      byte(hex),
      byte(hex),
      byte(hex),
      byte(hex),
    ],
    [literal("x"), byte(hex), optional(byte(hex))],
    [byte(range("0", "7")), optional(byte(range("0", "7"))), optional(byte(range("0", "7")))],
    [character()],
  ),
  paint("string.escape"),
);
const comments = [
  token("#'", "comment", pushState("roxygen")),
  token("#", "comment", pushState("lineComment")),
];
const assignmentFunction = lookahead(
  whitespace,
  choice([literal("<-")], [literal("<<-")], [literal("="), notNext("=")]),
  whitespace,
  choice([literal("function"), notNext(rest)], [literal("\\")]),
  whitespace,
  literal("("),
);
const call = lookahead(whitespace, literal("("));
const argument = lookahead(whitespace, literal("="), notNext("="));
const code = (inParens: boolean) => [
  ...comments,
  on(
    "rR",
    byte("rR"),
    literal('"'),
    bytes("-"),
    lookahead(byte("([{|")),
    saveRun(dashes),
    paint("string"),
    pushState("rawOpen"),
  ),
  ...(
    [
      ["(", "rawParen0"],
      ["[", "rawBracket0"],
      ["{", "rawBrace0"],
      ["|", "rawPipe0"],
    ] as const
  ).map(([open, state]) =>
    on("rR", byte("rR"), literal('"'), literal(open), paint("string"), pushState(state)),
  ),
  on(
    "rR",
    byte("rR"),
    literal("'"),
    bytes("-"),
    lookahead(byte("([{|")),
    saveRun(dashes),
    paint("string"),
    pushState("rawSingleOpen"),
  ),
  ...(
    [
      ["(", "rawSingleParen0"],
      ["[", "rawSingleBracket0"],
      ["{", "rawSingleBrace0"],
      ["|", "rawSinglePipe0"],
    ] as const
  ).map(([open, state]) =>
    on("rR", byte("rR"), literal("'"), literal(open), paint("string"), pushState(state)),
  ),
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
  number,
  on(".", literal(".."), bytes(digit), notNext(rest), paint("constant.builtin")),
  on("_", literal("_"), notNext(rest), paint("constant.builtin")),
  ...(inParens
    ? [
        on(union(letter, "."), identifier, argument, word("property")),
        on("`", ...quotedName, argument, paint("property")),
      ]
    : []),
  on(union(letter, "."), identifier, assignmentFunction, word("function")),
  on("`", ...quotedName, assignmentFunction, paint("function")),
  on(union(letter, "."), identifier, call, word("function")),
  on("`", ...quotedName, call, paint("function")),
  on(union(letter, "."), identifier, word("variable")),
  on("`", ...quotedName, paint("variable")),
  token("`", "variable", pushState("backtick")),
  token("\\", "keyword"),
  on("%", literal("%"), bytes(except(all, "%\r\n"), { min: 0 }), literal("%"), paint("operator")),
  ...[
    "<<-",
    "->>",
    ":::",
    "<-",
    "->",
    "::",
    "|>",
    "<=",
    ">=",
    "==",
    "!=",
    "&&",
    "||",
    "**",
    ":=",
  ].map((s) => token(s, "operator")),
  token(oneOf("$@"), "operator", pushState("member")),
  token("(", "punctuation.bracket", pushState("parens")),
  token("{", "punctuation.bracket", pushState("block")),
  token(oneOf("}[])"), "punctuation.bracket"),
  token(oneOf(",;"), "punctuation.delimiter"),
  token(oneOf("+-*/^<>=!&|~?:%"), "operator"),
];
export default defineGrammar({
  name: "r",
  extensions: ["r", "R"],
  filenames: [".Rprofile", "Rprofile.site", ".Rhistory"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code(false) },
    parens: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...code(true)],
    },
    block: {
      style: "plain",
      arms: [token("}", "punctuation.bracket", popState()), ...code(false)],
    },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(union(letter, "."), identifier, paint("variable.member"), popState()),
        on("`", ...quotedName, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    roxygen: {
      style: "comment",
      arms: [
        redispatch("\n", popState()),
        on(
          "@",
          literal("@"),
          byte(letter),
          bytes(union(letter, digit, "-_"), { min: 0 }),
          paint("attribute"),
        ),
      ],
    },
    doubleString: { style: "string", arms: [escape, token('"', "string", popState())] },
    singleString: { style: "string", arms: [escape, token("'", "string", popState())] },
    backtick: {
      style: "variable",
      arms: [
        on("\\", literal("\\"), character(), paint("variable")),
        token("`", "variable", popState()),
      ],
    },
    rawSingleOpen: {
      style: "string",
      arms: [
        token("(", "string", setState("rawSingleParen")),
        token("[", "string", setState("rawSingleBracket")),
        token("{", "string", setState("rawSingleBrace")),
        token("|", "string", setState("rawSinglePipe")),
      ],
    },
    rawSingleParen: {
      style: "string",
      arms: [
        on(
          ")",
          literal(")"),
          matchRun(dashes, { relation: "exact" }),
          literal("'"),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawSingleBracket: {
      style: "string",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(dashes, { relation: "exact" }),
          literal("'"),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawSingleBrace: {
      style: "string",
      arms: [
        on(
          "}",
          literal("}"),
          matchRun(dashes, { relation: "exact" }),
          literal("'"),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawSinglePipe: {
      style: "string",
      arms: [
        on(
          "|",
          literal("|"),
          matchRun(dashes, { relation: "exact" }),
          literal("'"),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawSinglePipe0: { style: "string", arms: [token("|'", "string", popState())] },
    rawSingleParen0: { style: "string", arms: [token(")'", "string", popState())] },
    rawSingleBracket0: { style: "string", arms: [token("]'", "string", popState())] },
    rawSingleBrace0: { style: "string", arms: [token("}'", "string", popState())] },
    rawOpen: {
      style: "string",
      arms: [
        token("(", "string", setState("rawParen")),
        token("[", "string", setState("rawBracket")),
        token("{", "string", setState("rawBrace")),
        token("|", "string", setState("rawPipe")),
      ],
    },
    rawParen: {
      style: "string",
      arms: [
        on(
          ")",
          literal(")"),
          matchRun(dashes, { relation: "exact" }),
          literal('"'),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawBracket: {
      style: "string",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(dashes, { relation: "exact" }),
          literal('"'),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawBrace: {
      style: "string",
      arms: [
        on(
          "}",
          literal("}"),
          matchRun(dashes, { relation: "exact" }),
          literal('"'),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawPipe: {
      style: "string",
      arms: [
        on(
          "|",
          literal("|"),
          matchRun(dashes, { relation: "exact" }),
          literal('"'),
          paint("string"),
          popState(),
        ),
      ],
    },
    rawPipe0: { style: "string", arms: [token('|"', "string", popState())] },
    rawParen0: { style: "string", arms: [token(')"', "string", popState())] },
    rawBracket0: { style: "string", arms: [token(']"', "string", popState())] },
    rawBrace0: { style: "string", arms: [token('}"', "string", popState())] },
  },
});
