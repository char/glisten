import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
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

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_", range("a", "z"), range("A", "Z"));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const qualifiedName = [...name, repeat(literal("::"), ...name)];
const whitespace = on(" \t\r\n", bytes(" \t\r\n"), paint("plain"));
const comment = token("#", "comment", pushState("comment"));
const trivia = [whitespace, comment];
const words = [
  { text: "def", then: [paint("keyword"), pushState("defName")] },
  { text: "import", then: [paint("keyword"), pushState("importPath")] },
  ...["label", "break"].map((text) => ({ text, then: [paint("keyword"), pushState("labelName")] })),
  ...keywordTable(
    `
      as module include if then elif else end try catch reduce foreach and or
    `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
];
const variable = on("$", literal("$"), ...qualifiedName, paint("variable"));
const variables = [
  ...["$__loc__", "$ENV"].map((name) =>
    on("$", literal(name), notNext(union(rest, ":")), paint("constant.builtin")),
  ),
  variable,
];
const number = on(
  ".0123456789",
  choice(
    [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
    [literal("."), bytes(digit)],
  ),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  paint("number"),
);
const expression = [
  ...trivia,
  token('"', "string", pushState("string")),
  ...variables,
  on("@", literal("@"), bytes(rest), paint("attribute")),
  number,
  // Bare names invoke filters, but this does not resolve bindings or builtins.
  on(first, ...qualifiedName, classify(words, [paint("function")])),
  token("..", "operator"),
  token(".", "operator", pushState("field")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("array")),
  token("{", "punctuation.bracket", pushState("objectKey")),
  ...["?//", "//=", "|=", "+=", "-=", "*=", "/=", "%=", "==", "!=", ">=", "<=", "//"].map((op) =>
    token(op, "operator"),
  ),
  token(oneOf("|?=+-*/%<>"), "operator"),
  token(oneOf(";,:"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "jq",
  extensions: ["jq"],
  initial: "root",
  states: {
    root: { style: "plain", arms: [...expression, token(oneOf(")]}"), "punctuation.bracket")] },
    paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...expression] },
    interpolation: {
      style: "plain",
      arms: [token(")", "punctuation.special", popState()), ...expression],
    },
    array: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...expression] },
    objectKey: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        token(":", "punctuation.delimiter", setState("objectValue")),
        token(",", "punctuation.delimiter"),
        token("(", "punctuation.bracket", pushState("paren")),
        token('"', "string", pushState("string")),
        ...variables,
        on(first, ...name, paint("property")),
      ],
    },
    objectValue: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token(",", "punctuation.delimiter", setState("objectKey")),
        ...expression,
      ],
    },
    field: {
      style: "plain",
      arms: [
        on(first, ...name, paint("property"), popState()),
        token('"', "string", setState("string")),
      ],
      otherwise: [popState()],
    },
    importPath: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", pushState("string")),
        on("a", literal("as"), notNext(rest), paint("keyword"), setState("importAlias")),
      ],
      otherwise: [popState()],
    },
    importAlias: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...name, paint("plain"), popState()),
        on("$", literal("$"), ...name, paint("variable"), popState()),
      ],
      otherwise: [popState()],
    },
    defName: {
      style: "plain",
      arms: [...trivia, on(first, ...name, paint("function"), setState("defArgsStart"))],
      otherwise: [popState()],
    },
    defArgsStart: {
      style: "plain",
      arms: [...trivia, token("(", "punctuation.bracket", setState("defArgs"))],
      otherwise: [popState()],
    },
    defArgs: {
      style: "plain",
      arms: [
        ...trivia,
        token(")", "punctuation.bracket", popState()),
        token(";", "punctuation.delimiter"),
        variable,
        on(first, ...name, paint("variable")),
      ],
      otherwise: [popState()],
    },
    labelName: {
      style: "plain",
      arms: [...trivia, on("$", literal("$"), ...name, paint("label"), popState())],
      otherwise: [popState()],
    },
    comment: {
      style: "comment",
      arms: [
        token("\\\\", "comment"),
        on("\\", literal("\\"), optional(literal("\r")), literal("\n"), paint("comment")),
        redispatch("\n", popState()),
      ],
    },
    string: {
      style: "string",
      arms: [
        token("\\(", "punctuation.special", pushState("interpolation")),
        on(
          "\\",
          literal("\\"),
          choice([byte('"\\/bfnrt')], [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)]),
          paint("string.escape"),
        ),
        token('"', "string", popState()),
      ],
    },
  },
});
