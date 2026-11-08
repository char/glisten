import {
  byte,
  byteSet,
  bytes,
  choice,
  character,
  defineGrammar,
  except,
  indentTo,
  lineEnd,
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
  saveColumn,
  setState,
  slot,
  token,
  union,
  wrap,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_-", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const any = byteSet({ ranges: [[0, 255]] });
const fragment = [literal("#{"), bytes(except(any, "}\n"), { min: 0 }), literal("}")];
const declarationEnd = [
  bytes(" \t", { min: 0 }),
  literal(":"),
  choice(
    [byte(" \t\r\n$0123456789([\"'!/")],
    [literal("#"), notNext("{")],
    [literal("."), byte(digit)],
    [byte("+-"), optional(literal(".")), byte(digit)],
    [lineEnd()],
  ),
];
const column = slot.column("commentIndent");
const variable = on("$", literal("$"), ...name, paint("variable"));
const interpolation = token("#{", "punctuation.special", pushState("interpolation"));
const comment = [
  on(
    "/",
    literal("/"),
    lookahead(literal("/")),
    saveColumn(column),
    paint("comment"),
    pushState("lineCommentStart"),
  ),
  on(
    "/",
    literal("/"),
    lookahead(literal("*")),
    saveColumn(column),
    paint("comment"),
    pushState("blockCommentStart"),
  ),
];
const strings = [
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
];
const number = on(
  "+-.0123456789",
  optional(byte("+-")),
  choice([bytes(digit), optional(literal("."), bytes(digit))], [literal("."), bytes(digit)]),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  paint("number"),
  pushState("unit"),
);
const value = [
  ...comment,
  interpolation,
  variable,
  ...strings,
  number,
  on(
    "#",
    literal("#"),
    choice(...[8, 6, 4, 3].map((count) => [bytes(hex, { min: count, max: count }), notNext(rest)])),
    paint("string"),
    wrap("constant.color", { from: "arm" }),
  ),
  ...`default global important`
    .trim()
    .split(/\s+/)
    .map((word) => on("!", literal("!"), literal(word), notNext(rest), paint("keyword"))),
  ...`and or not in from through to`
    .trim()
    .split(/\s+/)
    .map((word) => on(word[0]!, literal(word), notNext(rest), paint("operator"))),
  on(first, ...name, lookahead(literal("(")), paint("function")),
  on(first, ...name, paint("plain")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("bracket")),
  token(oneOf(")]"), "punctuation.bracket"),
  token(oneOf(",:"), "punctuation.delimiter"),
  token(oneOf("+-*/=<>%"), "operator"),
];
const selector = [
  ...comment,
  interpolation,
  variable,
  ...strings,
  token(".", "punctuation.delimiter", pushState("className")),
  token("#", "punctuation.delimiter", pushState("className")),
  token(":", "punctuation.delimiter", pushState("pseudoName")),
  on("%", literal("%"), ...name, paint("tag")),
  token(oneOf("[]()"), "punctuation.bracket"),
  token(",", "punctuation.delimiter"),
  token(oneOf(">+~|"), "operator"),
  token(oneOf("*&"), "tag"),
  on(first, ...name, paint("tag")),
];

export default defineGrammar({
  name: "sass",
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...comment,
        on("$", literal("$"), ...name, paint("variable"), setState("value")),
        on("@", literal("@extend"), notNext(rest), paint("keyword"), setState("selector")),
        ...`@mixin @include @function`
          .trim()
          .split(/\s+/)
          .map((word) =>
            on("@", literal(word), notNext(rest), paint("keyword"), setState("callable")),
          ),
        on("@", literal("@"), ...name, paint("keyword"), setState("value")),
        on("=+", byte("=+"), lookahead(byte(first)), paint("keyword"), setState("callable")),
        on(
          "#",
          lookahead(...fragment, repeat(choice(name, fragment)), ...declarationEnd),
          literal("#{"),
          paint("punctuation.special"),
          setState("propertyName"),
          pushState("interpolation"),
        ),
        on(
          first,
          ...name,
          lookahead(...fragment, repeat(choice(name, fragment)), ...declarationEnd),
          paint("property"),
          setState("propertyName"),
        ),
        on(
          first,
          ...name,
          lookahead(...declarationEnd),
          paint("property"),
          setState("afterProperty"),
        ),
        redispatch(union(first, ".#%&*[:\"'+>~|"), setState("selector")),
      ],
    },
    selector: { style: "plain", arms: [token("\n", "plain", setState("root")), ...selector] },
    propertyName: {
      style: "plain",
      arms: [
        interpolation,
        on(first, ...name, paint("property")),
        token(":", "punctuation.delimiter", setState("value")),
        token("\n", "plain", setState("root")),
      ],
    },
    afterProperty: {
      style: "plain",
      arms: [
        token(":", "punctuation.delimiter", setState("value")),
        token("\n", "plain", setState("root")),
      ],
    },
    callable: {
      style: "plain",
      arms: [
        on(first, ...name, paint("function"), setState("value")),
        token("\n", "plain", setState("root")),
      ],
    },
    value: { style: "plain", arms: [token("\n", "plain", setState("root")), ...value] },
    paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...value] },
    bracket: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...value] },
    unit: {
      style: "plain",
      arms: [on(first, ...name, paint("type"), popState()), token("%", "type", popState())],
      otherwise: [popState()],
    },
    className: {
      style: "plain",
      arms: [on(first, ...name, paint("property"), popState())],
      otherwise: [popState()],
    },
    pseudoName: {
      style: "plain",
      arms: [on(first, ...name, paint("attribute"), popState())],
      otherwise: [popState()],
    },
    interpolation: {
      style: "plain",
      arms: [
        token("}", "punctuation.special", popState()),
        token("{", "punctuation.bracket", pushState("interpolation")),
        ...value,
      ],
    },
    lineCommentStart: { style: "comment", arms: [token("/", "comment", setState("lineComment"))] },
    blockCommentStart: {
      style: "comment",
      arms: [token("*", "comment", setState("blockComment"))],
    },
    lineComment: {
      style: "comment",
      arms: [token("\n", "comment", setState("lineCommentIndent"))],
    },
    blockComment: {
      style: "comment",
      arms: [
        token("*/", "comment", popState()),
        token("\n", "comment", setState("blockCommentIndent")),
      ],
    },
    lineCommentIndent: {
      style: "plain",
      arms: [
        token("\n", "comment"),
        on(" \t", indentTo(column), paint("comment"), setState("lineComment")),
      ],
      otherwise: [popState(), setState("root")],
    },
    blockCommentIndent: {
      style: "plain",
      arms: [
        token("\n", "comment"),
        on(" \t", indentTo(column), paint("comment"), setState("blockComment")),
      ],
      otherwise: [popState(), setState("root")],
    },
    double: {
      style: "string",
      arms: [
        interpolation,
        token('"', "string", popState()),
        on("\\", literal("\\"), character(), paint("string.escape")),
        redispatch("\n", popState()),
      ],
    },
    single: {
      style: "string",
      arms: [
        interpolation,
        token("'", "string", popState()),
        on("\\", literal("\\"), character(), paint("string.escape")),
        redispatch("\n", popState()),
      ],
    },
  },
});
