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
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const first = union("_", range("a", "z"), range("A", "Z"));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const gap = bytes(" \t\r\n", { min: 0 });
const hex = union(digit, range("a", "f"), range("A", "F"));
const policyVariables = keywordTable(["principal", "resource", "context"], "variable");
const words = [
  ...keywordTable(
    `
    namespace entity type in appliesTo attributes tags enum
  `
      .trim()
      .split(/\s+/),
    "keyword",
  ),
  ...keywordTable(["true", "false"], "constant.builtin"),
  ...policyVariables,
];
const comment = token("//", "comment", pushState("comment"));

export default defineGrammar({
  name: "cedarschema",
  extensions: ["cedarschema"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        comment,
        token('"', "string", pushState("string")),
        token("@", "punctuation.special", pushState("annotation")),
        on(digit, bytes(digit), paint("number")),
        on(
          first,
          ...name,
          lookahead(gap, optional(literal("?"), gap), literal(":"), notNext(":")),
          classify(policyVariables, [paint("property")]),
        ),
        on("a", literal("action"), notNext(rest), paint("keyword"), pushState("actionNames")),
        on(first, ...name, classify(words, [paint("type")])),
        token("::", "punctuation.delimiter"),
        token(oneOf(",;:"), "punctuation.delimiter"),
        token(oneOf("()[]{}<>"), "punctuation.bracket"),
        token("?", "punctuation.special"),
        token("=", "operator"),
      ],
    },
    actionNames: {
      style: "plain",
      arms: [
        comment,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token('"', "string", pushState("string")),
        token(",", "punctuation.delimiter"),
        token(";", "punctuation.delimiter", popState()),
        on(
          first,
          ...name,
          classify(
            ["in", "appliesTo", "attributes"].map((text) => ({
              text,
              then: [paint("keyword"), popState()],
            })),
            [paint("function")],
          ),
        ),
      ],
      otherwise: [popState()],
    },
    annotation: {
      style: "plain",
      arms: [
        comment,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(first, ...name, paint("attribute"), popState()),
      ],
      otherwise: [popState()],
    },
    string: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          choice(
            [literal("x"), bytes(hex, { min: 2, max: 2 })],
            [literal("u{"), bytes(hex), literal("}")],
            [character()],
          ),
          paint("string.escape"),
        ),
        token('"', "string", popState()),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
  },
});
