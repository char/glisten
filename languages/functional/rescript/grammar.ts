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
  type Arm,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const first = union("_$", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit, "'");
const name = [byte(first), bytes(rest, { min: 0 })];
const gap = bytes(" \t", { min: 0 });
const hex = union(digit, range("a", "f"), range("A", "F"));
const escapeBody = choice(
  [literal("u{"), bytes(hex), literal("}")],
  [literal("u"), bytes(hex, { min: 4, max: 4 })],
  [literal("x"), bytes(hex, { min: 2, max: 2 })],
  [character()],
);
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const keywords =
  "and as assert async await catch constraint downto else exception export external for if in include lazy let module mutable of open private rec switch to try type unpack when while with".split(
    " ",
  );
const words = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["true", "false"], "constant.builtin"),
  ...keywordTable(
    [
      "int",
      "float",
      "string",
      "char",
      "bool",
      "unit",
      "array",
      "list",
      "option",
      "result",
      "promise",
    ],
    "type",
  ),
].map(({ text, then }) => ({
  text,
  then: [...then, pushState(text === "type" ? "typeHead" : "afterIdentifier")],
}));
const comments: Arm[] = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(union(hex, "_"))],
    [literal("0"), byte("bB"), bytes("01_")],
    [literal("0"), byte("oO"), bytes("01234567_")],
    [
      bytes(union(digit, "_")),
      optional(literal("."), notNext("."), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
  optional(literal("n")),
  paint("number"),
);
const jsxName = [byte(first), bytes(union(rest, "-:"), { min: 0 }), repeat(literal("."), ...name)];
const code: Arm[] = [
  ...comments,
  token('"', "string", pushState("string")),
  on(
    "'",
    lookahead(
      literal("'"),
      choice([literal("\\"), escapeBody], [notNext("'\\\r\n"), character()]),
      literal("'"),
    ),
    literal("'"),
    paint("string"),
    pushState("character"),
  ),
  on("'", literal("'"), ...name, paint("type")),
  token("`", "string", pushState("template")),
  on("@", literal("@"), ...name, repeat(literal("."), ...name), paint("attribute")),
  on(
    "%",
    literal("%"),
    optional(literal("%")),
    literal("raw"),
    notNext(rest),
    paint("keyword"),
    pushState("rawHead"),
  ),
  on("%", literal("%"), optional(literal("%")), ...name, paint("keyword")),
  on("#", literal("#"), ...name, paint("type")),
  number,
  on(
    "<",
    literal("<"),
    lookahead(choice([...jsxName, byte(" \t\r\n/>")], [literal(">")])),
    paint("punctuation.bracket"),
    pushState("jsxOpen"),
  ),
  on(upper, ...name, paint("type"), pushState("afterIdentifier")),
  on(
    first,
    ...name,
    lookahead(
      gap,
      literal("="),
      gap,
      literal("("),
      bytes(except(byteSet({ ranges: [[0, 255]] }), "()"), { min: 0 }),
      literal(")"),
      bytes(" \t\r\n", { min: 0 }),
      literal("=>"),
    ),
    classify(words, [paint("function"), pushState("afterIdentifier")]),
  ),
  on(
    first,
    ...name,
    lookahead(gap, literal("="), gap, ...name, gap, literal("=>")),
    classify(words, [paint("function"), pushState("afterIdentifier")]),
  ),
  on(
    first,
    ...name,
    lookahead(gap, choice([literal("(")], [literal("`")])),
    classify(words, [paint("function"), pushState("afterIdentifier")]),
  ),
  on(first, ...name, classify(words, [paint("variable"), pushState("afterIdentifier")])),
  ...["...", ".."].map((s) => token(s, "punctuation.special")),
  ...["+.", "-.", "*.", "/.", "++", "->", "|>", "|||", "||", "~~~", "=>", ":=", ":>", "+="].map(
    (s) => token(s, "operator"),
  ),
  token(".", "punctuation.delimiter", pushState("member")),
  token("{", "punctuation.bracket", pushState("block")),
  token("(", "punctuation.bracket", pushState("paren")),
  token(oneOf(")[]"), "punctuation.bracket"),
  token(oneOf(",;:|"), "punctuation.delimiter"),
  token("~", "punctuation.special", pushState("label")),
  token("?", "punctuation.special"),
  token(oneOf("=!<>&+-*/%^"), "operator"),
];
export default defineGrammar({
  name: "rescript",
  aliases: ["res"],
  initial: "root",
  states: {
    root: { style: "plain", arms: [...code, token("}", "punctuation.bracket")] },
    block: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        on(first, ...name, lookahead(gap, optional(literal("?")), literal(":")), paint("property")),
        ...code,
      ],
    },
    paren: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...code],
    },
    interpolation: {
      style: "plain",
      arms: [token("}", "punctuation.special", popState()), ...code],
    },
    typeHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(first, ...name, paint("type"), popState(), pushState("afterIdentifier")),
      ],
      otherwise: [popState()],
    },
    label: {
      style: "plain",
      arms: [on(first, ...name, paint("variable"), popState())],
      otherwise: [popState()],
    },
    afterIdentifier: {
      style: "plain",
      arms: [token("<<", "operator", popState()), token("<", "operator", popState())],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(upper, ...name, paint("type"), popState(), pushState("afterIdentifier")),
        on(
          first,
          ...name,
          lookahead(gap, literal("(")),
          paint("function"),
          popState(),
          pushState("afterIdentifier"),
        ),
        on(first, ...name, paint("variable.member"), popState(), pushState("afterIdentifier")),
      ],
      otherwise: [popState()],
    },
    rawHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token("(", "punctuation.bracket", setState("rawArgument")),
      ],
      otherwise: [popState()],
    },
    rawArgument: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token('"', "string", setState("rawClose"), pushState("string")),
        token("`", "string", setState("rawClose"), pushState("rawTemplate")),
      ],
      otherwise: [setState("paren")],
    },
    rawClose: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token(")", "punctuation.bracket", popState()),
      ],
      otherwise: [setState("paren")],
    },
    rawTemplate: { style: "string", arms: [escape, token("`", "string", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    character: { style: "string", arms: [escape, token("'", "string", popState())] },
    template: {
      style: "string",
      arms: [
        escape,
        token("${", "punctuation.special", pushState("interpolation")),
        token("`", "string", popState()),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    jsxOpen: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", setState("jsxChildren")),
        on(first, ...jsxName, paint("tag"), setState("jsxAttributes")),
      ],
    },
    jsxAttributes: {
      style: "plain",
      arms: [
        token("/>", "punctuation.bracket", popState()),
        token(">", "punctuation.bracket", setState("jsxChildren")),
        token("{", "punctuation.special", pushState("interpolation")),
        token('"', "string", pushState("string")),
        token("=", "operator"),
        on(first, ...name, paint("property")),
      ],
    },
    jsxChildren: {
      style: "plain",
      arms: [
        token("</", "punctuation.bracket", setState("jsxClose")),
        token("<", "punctuation.bracket", pushState("jsxOpen")),
        token("{", "punctuation.special", pushState("interpolation")),
      ],
    },
    jsxClose: {
      style: "plain",
      arms: [on(first, ...jsxName, paint("tag")), token(">", "punctuation.bracket", popState())],
    },
  },
});
