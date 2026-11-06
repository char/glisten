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
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const start = union(range("a", "z"), range("A", "Z"));
const rest = union(start, digit, "_");
const ident = [byte(start), bytes(rest, { min: 0 })];
const digits = union(digit, "_");
const hex = union(digits, range("a", "f"), range("A", "F"));
const keywords =
  `abs access after alias all and architecture array assert assume assume_guarantee attribute begin block body buffer bus case component configuration constant context cover default disconnect downto else elsif end entity exit fairness file for force function generate generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package parameter port postponed procedure process property protected private pure range record register reject release rem report restrict restrict_guarantee return rol ror select sequence severity shared signal sla sll sra srl strong subtype then to transport type unaffected units until use variable view vmode vpkg vprop vunit wait when while with xnor xor`.split(
    /\s+/,
  );
const types =
  `bit bit_vector boolean character integer natural positive real string time std_logic std_ulogic std_logic_vector std_ulogic_vector signed unsigned`.split(
    /\s+/,
  );
const wordCases = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(types, "type").map((item) => ({
    ...item,
    then: [...item.then, setState("afterValue")],
  })),
  ...keywordTable(["true", "false"], "constant.builtin").map((item) => ({
    ...item,
    then: [...item.then, setState("afterValue")],
  })),
];
const comments = [
  token("--", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const expressionEnd = [setState("afterValue")];

export default defineGrammar({
  name: "vhdl",
  aliases: ["vhd"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...comments,
        on(
          "0123456789bBoOxXdDuUsS",
          optional(bytes(digits)),
          optional(byte("uUsS")),
          byte("bBoOxXdD"),
          literal('"'),
          paint("string"),
          pushState("string"),
        ),
        token('"', "string", pushState("string")),
        on("'", literal("'"), character(), literal("'"), paint("string")),
        on(
          "0123456789",
          bytes(digits),
          choice(
            [
              literal("#"),
              bytes(hex),
              optional(literal("."), bytes(hex)),
              literal("#"),
              optional(byte("eE"), optional(byte("+-")), bytes(digits)),
            ],
            [
              optional(literal("."), byte(digit), bytes(digits, { min: 0 })),
              optional(byte("eE"), optional(byte("+-")), bytes(digits)),
            ],
          ),
          paint("number"),
        ),
        token("\\", "variable", pushState("extendedIdentifier")),
        on(
          start,
          ...ident,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          classify(wordCases, [paint("function"), ...expressionEnd], { caseless: true }),
        ),
        on(
          start,
          ...ident,
          classify(wordCases, [paint("variable"), ...expressionEnd], { caseless: true }),
        ),
        ...[
          "?/=",
          "?<=",
          "?>=",
          "??",
          "?=",
          "?<",
          "?>",
          "<=",
          ">=",
          ":=",
          "=>",
          "/=",
          "**",
          "<>",
          "<<",
          ">>",
        ].map((op) => token(op, "operator")),
        token(oneOf("+-*/=<>&|?"), "operator"),
        on(")", literal(")"), paint("punctuation.bracket"), setState("afterValue")),
        token(oneOf("([{}]"), "punctuation.bracket"),
        token(oneOf(".,:;'"), "punctuation.delimiter"),
      ],
    },
    afterValue: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(
          "'",
          literal("'"),
          lookahead(literal("(")),
          paint("punctuation.delimiter"),
          setState("root"),
        ),
        on(
          "'",
          literal("'"),
          lookahead(byte(start)),
          paint("punctuation.delimiter"),
          setState("attributeName"),
        ),
      ],
      otherwise: [setState("root")],
    },
    attributeName: {
      style: "plain",
      arms: [on(start, ...ident, paint("attribute"), setState("afterValue"))],
      otherwise: [setState("root")],
    },
    extendedIdentifier: {
      style: "variable",
      arms: [
        token("\\\\", "variable"),
        token("\\", "variable", popState(), setState("afterValue")),
        redispatch("\n\r", popState()),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    string: {
      style: "string",
      arms: [
        token('""', "string.escape"),
        token('"', "string", popState()),
        redispatch("\n\r", popState()),
      ],
    },
  },
});
