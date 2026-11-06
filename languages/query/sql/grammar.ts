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
  on,
  oneOf,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  setState,
  shell,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit, "$");
const tagRest = union(start, digit);
const name = [byte(start), bytes(rest, { min: 0 })];
const keywords =
  `add all alter always analyze and array as asc authorization auto_increment begin before between by cascade case cast check collate column comment commit concurrently conflict constraint copy create cross current_date current_time current_timestamp database default delete desc distinct do drop each else end except exclude exists execute explain extension false fetch filter for foreign from full function generated grant group having if ilike immutable in index inherits initially inner insert intersect into is join key language lateral leakproof left like limit materialized natural not nothing null nulls of off offset on or order outer over parallel partition policy primary procedure references recursive rename replace reset restrict returning returns revoke right role rollback row rows schema security select sequence set setof stored table temporary then to transaction trigger true truncate type union unique unsigned update using vacuum user value values view when where window with within without zone ordinality pragma attach detach autoincrement`.split(
    " ",
  );
const types =
  `bigint bigserial binary bit blob bool boolean bytea char character date datetime decimal double float int int2 int4 int8 integer interval json jsonb longblob longtext mediumblob mediumint mediumtext money nchar numeric nvarchar real regclass regtype serial serial2 serial4 serial8 smallint text time timestamp timestamptz timetz tinyblob tinyint tinytext uuid varbinary varbit varchar varying xml year`.split(
    " ",
  );
const relationKeywords = ["into", "table", "references"];
const cases = [
  { text: "create", then: [paint("keyword"), pushState("createHead")] },
  { text: "with", then: [paint("keyword"), pushState("cteHead")] },
  ...relationKeywords.map((text) => ({ text, then: [paint("keyword"), pushState("relation")] })),
  ...keywordTable(
    [...new Set(keywords)].filter(
      (x) => !["null", "true", "false", "create", "with", ...relationKeywords].includes(x),
    ),
    "keyword",
  ),
  ...keywordTable(types, "type"),
  ...keywordTable(["null", "true", "false"], "constant.builtin"),
];
// Generic dialects disagree on nested comments and backslash escapes;
// comments nest, and only E strings escape.
// MySQL # comments and backslash escapes in ordinary strings are not recognized;
// PostgreSQL's ? operator is indistinguishable here from a positional parameter.
// Dollar delimiters use the 256-byte shell capture; longer tags cannot close.
// Keyword and type names are classified lexically even when used as identifiers.
// Calls are recognized before '(' through whitespace, but not intervening comments.
const words = (wordCases = cases) => [
  on(
    start,
    ...name,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    classify(wordCases, [paint("function")], { caseless: true }),
  ),
  on(start, ...name, classify(wordCases, [paint("plain")], { caseless: true })),
];
const syntax = (wordCases = cases) => [
  token("--", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  on(
    "eE",
    previousNotIn(rest),
    byte("eE"),
    literal("'"),
    paint("string"),
    pushState("escapeString"),
  ),
  token("'", "string", pushState("string")),
  token('"', "variable", pushState("quoted")),
  token("`", "variable", pushState("backtick")),
  on(
    "$",
    literal("$"),
    optional(byte(start), bytes(tagRest, { min: 0 })),
    literal("$"),
    paint("string"),
    shell.captureReset(),
    shell.captureAppend(),
    pushState("dollar"),
  ),
  on("$", literal("$"), bytes(digit), paint("variable")),
  on(":@", byte(":@"), byte(start), bytes(rest, { min: 0 }), paint("variable")),
  on("?", literal("?"), bytes(digit, { min: 0 }), paint("variable")),
  on(
    "0123456789.",
    choice(
      [literal("0"), byte("xX"), bytes(hex)],
      [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
      [literal("."), bytes(digit)],
    ),
    optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    paint("number"),
  ),
  ...words(wordCases),
  ...["::", "->>", "->", "#>>", "#>", "<=", ">=", "<>", "!=", "||", "&&", ":=", "<<", ">>"].map(
    (s) => token(s, "operator"),
  ),
  token(oneOf("+-*/%=<>~!|&^"), "operator"),
  token(oneOf("()[]"), "punctuation.bracket"),
  token(oneOf(",;."), "punctuation.delimiter"),
];
export default defineGrammar({
  name: "sql",
  aliases: ["postgresql", "postgres", "sqlite"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: syntax(),
    },
    createHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(
          start,
          ...name,
          classify(
            [
              ...["unique", "temporary", "temp", "or", "replace"].map((text) => ({
                text,
                then: [paint("keyword")],
              })),
              ...["index", "trigger", "policy"].map((text) => ({
                text,
                then: [paint("keyword"), setState("createOn")],
              })),
              ...["table", "function", "procedure"].map((text) => ({
                text,
                then: [paint("keyword"), popState(), pushState("relation")],
              })),
              ...keywordTable(
                ["view", "database", "schema", "sequence", "extension", "cast"],
                "keyword",
              ).map((item) => ({
                ...item,
                then: [...item.then, popState()],
              })),
            ],
            [paint("plain"), popState()],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [popState()],
    },
    createOn: {
      style: "plain",
      arms: [
        token(";", "punctuation.delimiter", popState()),
        ...syntax([
          { text: "on", then: [paint("keyword"), popState(), pushState("relation")] },
          ...cases.filter((item) => item.text !== "on"),
        ]),
      ],
    },
    cteHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(
          start,
          ...name,
          classify(
            [
              { text: "recursive", then: [paint("keyword")] },
              ...["function", "ordinality", "time", "check", "data"].map((text) => ({
                text,
                then: [paint("keyword"), popState()],
              })),
            ],
            [paint("plain"), setState("cteAfterName")],
            { caseless: true },
          ),
        ),
        token('"', "variable", setState("cteAfterName"), pushState("quoted")),
      ],
      otherwise: [popState()],
    },
    cteAfterName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        token("(", "punctuation.bracket", pushState("cteColumns")),
        on(
          start,
          ...name,
          classify(
            [{ text: "as", then: [paint("keyword"), setState("cteAfterAs")] }],
            [paint("plain"), popState()],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [popState()],
    },
    cteColumns: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...syntax()],
    },
    cteAfterAs: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        on(
          start,
          ...name,
          classify(keywordTable(["not", "materialized"], "keyword"), [paint("plain"), popState()], {
            caseless: true,
          }),
        ),
        token("(", "punctuation.bracket", setState("cteAfterBody"), pushState("cteBody")),
      ],
      otherwise: [popState()],
    },
    cteBody: {
      style: "plain",
      arms: [
        token("(", "punctuation.bracket", pushState("cteBody")),
        token(")", "punctuation.bracket", popState()),
        ...syntax(),
      ],
    },
    cteAfterBody: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        token(",", "punctuation.delimiter", setState("cteHead")),
      ],
      otherwise: [popState()],
    },
    relation: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("--", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        token('"', "variable", pushState("relationQuoted")),
        token("`", "variable", pushState("relationBacktick")),
        token(".", "punctuation.delimiter"),
        on(start, ...name, lookahead(bytes(" \t\r\n", { min: 0 }), literal(".")), paint("plain")),
        on(
          start,
          ...name,
          classify(
            [...keywordTable(["if", "not", "exists", "only", "recursive"], "keyword")],
            [paint("plain"), popState()],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [popState()],
    },
    relationQuoted: {
      style: "variable",
      arms: [
        token('""', "variable"),
        token('"', "variable", popState(), setState("relationAfterQuoted")),
      ],
    },
    relationBacktick: {
      style: "variable",
      arms: [
        token("``", "variable"),
        token("`", "variable", popState(), setState("relationAfterQuoted")),
      ],
    },
    relationAfterQuoted: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token(".", "punctuation.delimiter", setState("relation")),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [token("''", "string.escape"), token("'", "string", popState())],
    },
    escapeString: {
      style: "string",
      arms: [
        token("''", "string.escape"),
        on("\\", literal("\\"), character(), paint("string.escape")),
        token("'", "string", popState()),
      ],
    },
    quoted: {
      style: "variable",
      arms: [token('""', "variable"), token('"', "variable", popState())],
    },
    backtick: {
      style: "variable",
      arms: [token("``", "variable"), token("`", "variable", popState())],
    },
    dollar: { style: "string", arms: [on("$", shell.captured(), paint("string"), popState())] },
  },
});
