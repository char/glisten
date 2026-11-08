import {
  byte,
  bytes,
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
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union(range("a", "z"), range("A", "Z"), "_");
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const levels = slot.run("longLevel");
const keywords = `
  and break do else elseif end for goto if in not or repeat return then until while
`
  .trim()
  .split(/\s+/);
const builtin = `
  _G _VERSION coroutine debug io math os package string table utf8 bit jit
`
  .trim()
  .split(/\s+/);
const cases = [
  { text: "local", then: [paint("keyword"), pushState("localName")] },
  { text: "function", then: [paint("keyword"), pushState("functionName")] },
  { text: "goto", then: [paint("keyword"), pushState("gotoName")] },
  ...keywordTable(
    keywords.filter((x) => x !== "goto"),
    "keyword",
  ),
  ...keywordTable(["true", "false", "nil"], "constant.builtin"),
  ...keywordTable(builtin, "constant.builtin"),
];
const space = bytes(" \t\r\n\v\f", { min: 0 });
// Comments between a callee and its argument list are not included in this lookahead.
const call = lookahead(
  space,
  choice([byte("({\"'")], [literal("[[")], [literal("["), bytes("="), literal("[")]),
);
// Bare table keys and function-valued assignments retain variable styling.
const word = [
  on(start, ...ident, call, classify(cases, [paint("function")])),
  on(start, ...ident, classify(cases, [paint("variable")])),
];
const number = on(
  union(digit, "."),
  choice(
    [
      literal("0"),
      byte("xX"),
      bytes(hex),
      optional(literal("."), bytes(hex, { min: 0 })),
      optional(byte("pP"), optional(byte("+-")), bytes(digit)),
    ],
    [
      literal("0"),
      byte("xX"),
      literal("."),
      bytes(hex),
      optional(byte("pP"), optional(byte("+-")), bytes(digit)),
    ],
    [
      bytes(digit),
      optional(literal("."), notNext("."), bytes(digit, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    ],
    [literal("."), bytes(digit), optional(byte("eE"), optional(byte("+-")), bytes(digit))],
  ),
  paint("number"),
);
// Numeric escapes are colored lexically; their decoded range is not checked.
const escape = [
  on("\\", literal("\\z"), bytes(" \t\r\n\v\f", { min: 0 }), paint("string.escape")),
  on(
    "\\",
    literal("\\"),
    choice(
      [literal("x"), byte(hex), byte(hex)],
      [literal("u{"), bytes(hex), literal("}")],
      [bytes(digit, { min: 1, max: 3 })],
      [literal("\r\n")],
      [literal("\n\r")],
      [byte("abfnrtv\\\"'\r\n")],
    ),
    paint("string.escape"),
  ),
];
const longOpen = (prefix: string, style: "string" | "comment", state: string) =>
  on(
    prefix[0]!,
    literal(prefix),
    bytes("="),
    lookahead(literal("[")),
    saveRun(levels),
    paint(style),
    pushState(state),
  );
const comments = [
  longOpen("--[", "comment", "longCommentOpen"),
  token("--[[", "comment", pushState("longComment0")),
  token("--", "comment", pushState("lineComment")),
];
const syntax = [
  ...comments,
  longOpen("[", "string", "longStringOpen"),
  token("[[", "string", pushState("longString0")),
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
  number,
  ...word,
  token("...", "constant.builtin"),
  ...["..", "//", "==", "~=", "<=", ">=", "<<", ">>"].map((s) => token(s, "operator")),
  token("::", "punctuation.delimiter", pushState("labelName")),
  token(".", "punctuation.delimiter", pushState("field")),
  token(":", "punctuation.delimiter", pushState("field")),
  token(oneOf("+-*/%^#&|~<>="), "operator"),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "lua",
  extensions: ["lua"],
  aliases: ["lua5.4", "lua5.3", "lua5.2", "lua5.1", "luajit"],
  initial: "start",
  states: {
    start: {
      style: "plain",
      arms: [token("#!", "comment", setState("root"), pushState("lineComment"))],
      otherwise: [setState("root")],
    },
    root: { style: "plain", arms: syntax },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    doubleString: {
      style: "string",
      arms: [...escape, token('"', "string", popState()), redispatch("\n\r", popState())],
    },
    singleString: {
      style: "string",
      arms: [...escape, token("'", "string", popState()), redispatch("\n\r", popState())],
    },
    longStringOpen: { style: "string", arms: [token("[", "string", setState("longString"))] },
    longString: {
      style: "string",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(levels, { relation: "exact" }),
          literal("]"),
          paint("string"),
          popState(),
        ),
      ],
    },
    longString0: { style: "string", arms: [token("]]", "string", popState())] },
    longCommentOpen: { style: "comment", arms: [token("[", "comment", setState("longComment"))] },
    longComment: {
      style: "comment",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(levels, { relation: "exact" }),
          literal("]"),
          paint("comment"),
          popState(),
        ),
      ],
    },
    longComment0: { style: "comment", arms: [token("]]", "comment", popState())] },
    localName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(
          start,
          ...ident,
          classify(
            [{ text: "function", then: [paint("keyword"), setState("functionName")] }],
            [paint("variable"), setState("localAfter")],
          ),
        ),
      ],
      otherwise: [popState()],
    },
    localAfter: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token(",", "punctuation.delimiter", setState("localName")),
        on(
          "<",
          literal("<"),
          lookahead(space, choice([literal("const")], [literal("close")]), space, literal(">")),
          paint("punctuation.bracket"),
          pushState("attribute"),
        ),
      ],
      otherwise: [popState()],
    },
    attribute: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(start, ...ident, paint("attribute")),
        token(">", "punctuation.bracket", popState()),
      ],
    },
    functionName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, lookahead(space, byte(".:")), paint("variable")),
        on(start, ...ident, paint("function"), popState()),
        token(oneOf(".:"), "punctuation.delimiter"),
      ],
      otherwise: [popState()],
    },
    field: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, call, paint("function"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    gotoName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, paint("label"), popState()),
      ],
      otherwise: [popState()],
    },
    labelName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, paint("label"), setState("labelEnd")),
      ],
      otherwise: [popState()],
    },
    labelEnd: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token("::", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
  },
});
