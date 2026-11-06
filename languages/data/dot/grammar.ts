import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  keywordTable,
  literal,
  on,
  openInjection,
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
const idStart = union(range("a", "z"), range("A", "Z"), "_", byteSet({ ranges: [[128, 255]] }));
const idRest = union(idStart, digit);

export default defineGrammar({
  name: "dot",
  aliases: ["graphviz", "gv"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("lineComment")),
        token("//", "comment", pushState("lineComment")),
        token("/*", "comment", pushState("blockComment")),
        token('"', "string", pushState("quoted")),
        token("<", "string", openInjection({ static: "html" }), pushState("htmlOuter")),
        token("--", "operator"),
        token("->", "operator"),
        on(
          "-.0123456789",
          optional(literal("-")),
          choice(
            [literal("."), bytes(digit)],
            [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
          ),
          paint("number"),
        ),
        on(
          idStart,
          byte(idStart),
          bytes(idRest, { min: 0 }),
          classify(
            keywordTable(["strict", "graph", "digraph", "subgraph", "node", "edge"], "keyword"),
            [paint("plain")],
            { caseless: true },
          ),
        ),
        token("=", "operator"),
        token("+", "operator"),
        ...["{", "}", "[", "]"].map((s) => token(s, "punctuation.bracket")),
        ...[";", ",", ":"].map((s) => token(s, "punctuation.delimiter")),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    quoted: {
      style: "string",
      arms: [
        token("\\\\", "string"),
        token('\\"', "string.escape"),
        token("\\\n", "string.escape"),
        token('"', "string", popState()),
      ],
    },
    // Graphviz's scanner counts angle brackets without interpreting XML syntax.
    htmlOuter: {
      style: "string",
      arms: [
        token("<", "string", pushState("html")),
        on(">", literal(">"), closeInjection(), paint("string"), popState()),
      ],
    },
    html: {
      style: "string",
      arms: [token("<", "string", pushState("html")), token(">", "string", popState())],
    },
  },
});
