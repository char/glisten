import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineStart,
  literal,
  lookahead,
  matchRun,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  saveRun,
  setState,
  slot,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const whitespace = " \t\r\n";
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const quotes = Array.from({ length: 4 }, (_, i) => slot.run(`rawQuotes${i}`));
const keywords =
  "abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while".split(
    " ",
  );
const types =
  "bool byte char decimal double float int long object sbyte short string uint ulong ushort void dynamic nint nuint".split(
    " ",
  );
const cases = [
  ...keywordTable(
    keywords.filter((word) => word !== "new"),
    "keyword",
  ),
  { text: "new", then: [paint("keyword"), pushState("newType")] },
  ...keywordTable(types, "type"),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [literal("U"), bytes(hex, { min: 8, max: 8 })],
    [literal("x"), bytes(hex, { min: 1, max: 4 })],
    [character()],
  ),
  paint("string.escape"),
);
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("bB"), bytes("01_")],
    [
      bytes(union(digit, "_")),
      optional(literal("."), bytes(union(digit, "_"))),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
  bytes("uUlLfFdDmM", { min: 0 }),
  paint("number"),
);
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const boundary = notNext(rest);
const contextArms: Arm[] = [
  on(
    "v",
    literal("var"),
    boundary,
    lookahead(
      bytes(whitespace),
      optional(literal("@")),
      ...ident,
      choice(
        [bytes(whitespace, { min: 0 }), byte("=;,):")],
        [bytes(whitespace), literal("in"), boundary],
      ),
    ),
    paint("keyword"),
  ),
  on(
    "n",
    literal("nameof"),
    boundary,
    lookahead(bytes(whitespace, { min: 0 }), literal("(")),
    paint("keyword"),
  ),
  on(
    "p",
    literal("partial"),
    boundary,
    lookahead(
      bytes(whitespace),
      choice([literal("class")], [literal("struct")], [literal("interface")], [literal("record")]),
      boundary,
    ),
    paint("keyword"),
  ),
  on(
    "y",
    literal("yield"),
    boundary,
    lookahead(bytes(whitespace), choice([literal("return")], [literal("break")]), boundary),
    paint("keyword"),
  ),
  on(
    "r",
    literal("record"),
    boundary,
    lookahead(bytes(whitespace), ...ident),
    paint("keyword"),
    pushState("recordName"),
  ),
  on(
    "a",
    literal("async"),
    boundary,
    lookahead(bytes(whitespace), choice([...ident], [literal("(")])),
    paint("keyword"),
  ),
  on(
    "a",
    literal("await"),
    boundary,
    lookahead(bytes(whitespace), byte(union(start, "(@"))),
    paint("keyword"),
  ),
  on(
    "gsi",
    choice([literal("get")], [literal("set")], [literal("init")]),
    boundary,
    lookahead(
      bytes(whitespace, { min: 0 }),
      choice([literal("{")], [literal(";")], [literal("=>")]),
    ),
    paint("keyword"),
  ),
  on(
    "w",
    literal("where"),
    boundary,
    lookahead(bytes(whitespace), ...ident, bytes(whitespace, { min: 0 }), literal(":")),
    paint("keyword"),
  ),
  on(
    "g",
    literal("global"),
    boundary,
    lookahead(choice([literal("::")], [bytes(whitespace), literal("using"), boundary])),
    paint("keyword"),
  ),
  on(
    "f",
    literal("file"),
    boundary,
    lookahead(
      bytes(whitespace),
      choice(
        [literal("class")],
        [literal("struct")],
        [literal("interface")],
        [literal("record")],
        [literal("enum")],
      ),
      boundary,
    ),
    paint("keyword"),
  ),
  on(
    "rs",
    choice([literal("required")], [literal("scoped")]),
    boundary,
    lookahead(bytes(whitespace), ...ident, bytes(whitespace), ...ident),
    paint("keyword"),
  ),
];

function rawOpen(depth: number): Arm[] {
  if (depth >= quotes.length) return [];
  const slot = quotes[depth]!;
  return [
    ...Array.from({ length: 8 }, (_, i) => 8 - i).map((n) =>
      on(
        "$",
        previousNotIn("$"),
        literal("$".repeat(n)),
        lookahead(bytes('"', { min: 3 })),
        paint("string"),
        pushState(`rawPrefix${depth}_${n}`),
      ),
    ),
    on('"', bytes('"', { min: 3 }), saveRun(slot), paint("string"), pushState(`raw${depth}_0`)),
  ];
}
function code(depth: number): Arm[] {
  return [
    on(
      " \t#",
      lineStart(),
      bytes(" \t", { min: 0 }),
      literal("#"),
      paint("keyword"),
      pushState("directive"),
    ),
    ...comments,
    ...rawOpen(depth),
    token('$@"', "string", pushState(`verbatimInterpolated${depth}`)),
    token('@$"', "string", pushState(`verbatimInterpolated${depth}`)),
    token('$"', "string", pushState(`interpolated${depth}`)),
    token('@"', "string", pushState("verbatim")),
    token('"', "string", pushState("string")),
    token("'", "string", pushState("char")),
    number,
    on(
      "[",
      literal("["),
      lookahead(
        bytes(" \t", { min: 0 }),
        choice(
          [byte(upper)],
          ..."assembly module return field property method param type typevar event"
            .split(" ")
            .map((text) => [literal(text), boundary]),
        ),
      ),
      paint("punctuation.bracket"),
      pushState(`attribute${depth}`),
    ),
    ...contextArms,
    on(
      "f",
      literal("from"),
      boundary,
      lookahead(bytes(whitespace), ...ident, bytes(whitespace), literal("in"), boundary),
      paint("keyword"),
      pushState(`linq${depth}`),
    ),
    on("@", literal("@"), ...ident, paint("variable")),
    on(
      start,
      ...ident,
      lookahead(bytes(whitespace, { min: 0 }), literal("(")),
      classify(cases, [paint("function")]),
    ),
    on(upper, ...ident, classify(cases, [paint("type")])),
    on(start, ...ident, classify(cases, [paint("variable")])),
    token("=>", "operator"),
    token("::", "operator"),
    token("?.", "operator"),
    token("??=", "operator"),
    token("??", "operator"),
    token(oneOf("{}[]()"), "punctuation.bracket"),
    token(oneOf(".,;:"), "punctuation.delimiter"),
    token(oneOf("+-*/%=!<>&|^~?@"), "operator"),
  ];
}

const states: Record<string, State> = {
  initial: {
    style: "plain",
    arms: [token("\ufeff", "plain", setState("afterBom"))],
    otherwise: [setState("root")],
  },
  afterBom: {
    style: "plain",
    arms: [
      on(
        " \t#",
        bytes(" \t", { min: 0 }),
        literal("#"),
        paint("keyword"),
        setState("root"),
        pushState("directive"),
      ),
    ],
    otherwise: [setState("root")],
  },
  root: { style: "plain", arms: code(0) },
  newType: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(whitespace), paint("plain")),
      ...comments,
      on(start, ...ident, paint("type"), setState("newTypeTail")),
      redispatch(all, popState()),
    ],
  },
  newTypeTail: {
    style: "plain",
    arms: [
      on(
        ".",
        literal("."),
        lookahead(...ident),
        paint("punctuation.delimiter"),
        setState("newType"),
      ),
      redispatch(all, popState()),
    ],
  },
  recordName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(whitespace), paint("plain")),
      on(
        start,
        ...ident,
        classify(
          [
            { text: "class", then: [paint("keyword")] },
            { text: "struct", then: [paint("keyword")] },
          ],
          [paint("type"), popState()],
        ),
      ),
      redispatch(all, popState()),
    ],
  },
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
  directive: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      on(
        start,
        ...ident,
        classify(
          keywordTable(
            "if elif else endif define undef warning error line region endregion pragma nullable".split(
              " ",
            ),
            "keyword",
          ),
          [paint("plain")],
        ),
      ),
      token("//", "comment", pushState("lineComment")),
      token('"', "string", pushState("string")),
      token("\n", "plain", popState()),
    ],
  },
  string: {
    style: "string",
    arms: [
      escape,
      on('"', literal('"'), optional(literal("u8")), paint("string"), popState()),
      redispatch("\n", popState()),
    ],
  },
  char: {
    style: "string",
    arms: [escape, token("'", "string", popState()), redispatch("\n", popState())],
  },
  verbatim: {
    style: "string",
    arms: [
      token('""', "string.escape"),
      on('"', literal('"'), optional(literal("u8")), paint("string"), popState()),
    ],
  },
};
for (let depth = 0; depth <= quotes.length; depth++) {
  const expr = `expression${depth}`;
  const nested = `nested${depth}`;
  const paren = `paren${depth}`;
  const bracket = `bracket${depth}`;
  const body = code(depth);
  const nests = [
    token("{", "punctuation.bracket", pushState(nested)),
    token("(", "punctuation.bracket", pushState(paren)),
    token("[", "punctuation.bracket", pushState(bracket)),
  ];
  states[expr] = {
    style: "plain",
    arms: [
      token("}", "punctuation.special", popState()),
      token("::", "operator"),
      token(":", "punctuation.delimiter", setState(`format${depth}`)),
      ...nests,
      ...body,
    ],
  };
  for (const [name, close] of [
    [nested, "}"],
    [paren, ")"],
    [bracket, "]"],
  ] as const)
    states[name] = {
      style: "plain",
      arms: [token(close, "punctuation.bracket", popState()), ...nests, ...body],
    };
  states[`format${depth}`] = {
    style: "string",
    arms: [token("}}", "string.escape"), token("}", "punctuation.special", popState())],
  };
  states[`interpolated${depth}`] = {
    style: "string",
    arms: [
      escape,
      token("{{", "string.escape"),
      token("}}", "string.escape"),
      token("{", "punctuation.special", pushState(expr)),
      on('"', literal('"'), optional(literal("u8")), paint("string"), popState()),
      redispatch("\n", popState()),
    ],
  };
  states[`verbatimInterpolated${depth}`] = {
    style: "string",
    arms: [
      token('""', "string.escape"),
      token("{{", "string.escape"),
      token("}}", "string.escape"),
      token("{", "punctuation.special", pushState(expr)),
      on('"', literal('"'), optional(literal("u8")), paint("string"), popState()),
    ],
  };
  const queryWords = "where select let join on equals into orderby ascending descending group by"
    .split(" ")
    .map((text) =>
      on(start, previousNotIn(union(rest, ".")), literal(text), boundary, paint("keyword")),
    );
  states[`linq${depth}`] = {
    style: "plain",
    arms: [
      redispatch(";}", popState()),
      token("{", "punctuation.bracket", pushState(`linqBraces${depth}`)),
      ...queryWords,
      ...body,
    ],
  };
  states[`linqBraces${depth}`] = {
    style: "plain",
    arms: [
      token("}", "punctuation.bracket", popState()),
      token("{", "punctuation.bracket", pushState(`linqBraces${depth}`)),
      ...queryWords,
      ...body,
    ],
  };
  states[`attribute${depth}`] = {
    style: "plain",
    arms: [
      token("]", "punctuation.bracket", popState()),
      token("(", "punctuation.bracket", pushState(paren)),
      on(start, ...ident, paint("attribute")),
      ...body,
    ],
  };
  if (depth === quotes.length) continue;
  const quote = quotes[depth]!;
  for (let n = 0; n <= 8; n++) {
    if (n > 0)
      states[`rawPrefix${depth}_${n}`] = {
        style: "string",
        arms: [
          on(
            '"',
            bytes('"', { min: 3 }),
            saveRun(quote),
            paint("string"),
            setState(`raw${depth}_${n}`),
          ),
        ],
      };
    const rawExpr = `rawExpression${depth}_${n}`;
    const rawFormat = `rawFormat${depth}_${n}`;
    states[`raw${depth}_${n}`] = {
      style: "string",
      arms: [
        on(
          '"',
          matchRun(quote, { relation: "exact" }),
          optional(literal("u8")),
          paint("string"),
          popState(),
        ),
        ...(n
          ? [on("{", literal("{".repeat(n)), paint("punctuation.special"), pushState(rawExpr))]
          : []),
      ],
    };
    if (n > 0) {
      states[rawExpr] = {
        style: "plain",
        arms: [
          token("}".repeat(n), "punctuation.special", popState()),
          token("::", "operator"),
          token(":", "punctuation.delimiter", setState(rawFormat)),
          token("{", "punctuation.bracket", pushState(`nested${depth + 1}`)),
          token("(", "punctuation.bracket", pushState(`paren${depth + 1}`)),
          token("[", "punctuation.bracket", pushState(`bracket${depth + 1}`)),
          ...code(depth + 1),
        ],
      };
      states[rawFormat] = {
        style: "string",
        arms: [token("}".repeat(n), "punctuation.special", popState())],
      };
    }
  }
}

// Quote lengths use run slots. Dollar and brace bytes cannot share a run slot,
// so interpolated raw strings support one through eight dollars, nested four deep.
// Contextual words and attribute/indexing ambiguities are lexical approximations.
export default defineGrammar({
  name: "c-sharp",
  aliases: ["cs", "csharp"],
  initial: "initial",
  states,
});
