import {
  byte,
  bytes,
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
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const first = union("_", range("a", "z"), range("A", "Z"));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const keywords = "package import as default else if contains in every some not with".split(" ");
const cases = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["true", "false", "null"], "constant.builtin"),
  ...keywordTable(["input", "data", "_"], "constant.builtin"),
];
const word = on(first, ...name, classify(cases, [paint("variable")]));
const number = on(
  digit,
  bytes(digit),
  optional(literal("."), bytes(digit)),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  paint("number"),
);
const comment = token("#", "comment", pushState("comment"));
const expression = [
  comment,
  token('$"', "string", pushState("template")),
  token("$`", "string", pushState("rawTemplate")),
  token('"', "string", pushState("string")),
  token("`", "string", pushState("raw")),
  number,
  on(
    first,
    ...name,
    repeat(literal("."), ...name),
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    paint("function"),
  ),
  word,
  token(".", "punctuation.delimiter", pushState("member")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("square")),
  token("{", "punctuation.bracket", pushState("curly")),
  ...[":=", "==", "!=", "<=", ">="].map((s) => token(s, "operator")),
  token(oneOf("=<>+-*/%|&"), "operator"),
  token(oneOf(",;:"), "punctuation.delimiter"),
];
const escape = on("\\", literal("\\"), character(), paint("string.escape"));

// A first non-keyword identifier on a module line is treated as a rule head;
// multi-line heads are not parsed. Keywords use Rego v1 regardless of imports,
// and call styling is lexical rather than resolving builtins or shadowing.
export default defineGrammar({
  name: "rego",
  initial: "head",
  states: {
    head: {
      style: "plain",
      arms: [
        comment,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(
          first,
          ...name,
          classify(
            [
              { text: "default", then: [paint("keyword")] },
              ...keywords
                .filter((s) => s !== "default")
                .map((text) => ({ text, then: [paint("keyword"), setState("root")] })),
              ...keywordTable(["true", "false", "null"], "constant.builtin"),
            ],
            [paint("property"), setState("root")],
          ),
        ),
      ],
      otherwise: [setState("root")],
    },
    root: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("head")),
        ...expression,
        token(oneOf(")]}"), "punctuation.bracket"),
      ],
    },
    paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...expression] },
    square: {
      style: "plain",
      arms: [token("]", "punctuation.bracket", popState()), ...expression],
    },
    curly: { style: "plain", arms: [token("}", "punctuation.bracket", popState()), ...expression] },
    member: {
      style: "plain",
      arms: [on(first, ...name, paint("variable.member"), popState())],
      otherwise: [popState()],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    raw: { style: "string", arms: [token("`", "string", popState())] },
    template: {
      style: "string",
      arms: [
        escape,
        token("{", "punctuation.special", pushState("interpolation")),
        token('"', "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    rawTemplate: {
      style: "string",
      arms: [
        token("\\{", "string.escape"),
        token("{", "punctuation.special", pushState("interpolation")),
        token("`", "string", popState()),
      ],
    },
    interpolation: {
      style: "plain",
      arms: [token("}", "punctuation.special", popState()), ...expression],
    },
  },
});
