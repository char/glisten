import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  indentTo,
  keywordTable,
  literal,
  lookahead,
  on,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  saveColumn,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const word = union(range("a", "z"), range("A", "Z"), range("0", "9"), "_-");
const nonspace = except(all, " \t\r\n");
const indent = slot.column("helpIndent");
const keywords = `
  mainmenu config configdefault menuconfig choice endchoice menu endmenu if endif source rsource
  osource orsource comment prompt default depends on select imply range visible optional modules
  def_bool def_tristate def_int def_hex def_string
`
  .trim()
  .split(/\s+/);
const types = ["bool", "boolean", "tristate", "int", "hex", "string"];
const expansion = token("$(", "punctuation.special", pushState("macro"));
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const words = on(
  word,
  bytes(word),
  classify(
    [
      { text: "help", then: [paint("keyword"), setState("helpTail")] },
      { text: "---help---", then: [paint("keyword"), setState("helpTail")] },
      ...keywords.map((text) => ({ text, then: [paint("keyword"), setState("line")] })),
      ...types.map((text) => ({ text, then: [paint("type"), setState("line")] })),
    ],
    [paint("variable"), setState("line")],
  ),
);
// Statement context is not parsed: y/m/n are styled as constants wherever an expression word occurs.
const expressionWord = on(
  word,
  bytes(word),
  classify(
    [
      ...keywordTable(["if", "on"], "keyword"),
      ...keywordTable(["y", "m", "n"], "constant.builtin"),
    ],
    [paint("variable")],
  ),
);
const lineContinuation = on(
  "\\",
  literal("\\"),
  choice([literal("\r\n")], [literal("\n")]),
  paint("string.escape"),
);
const code = [
  token("#", "comment", pushState("comment")),
  expansion,
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
  lineContinuation,
  token("&&", "operator"),
  token("||", "operator"),
  token("!=", "operator"),
  token("<=", "operator"),
  token(">=", "operator"),
  token(":=", "operator"),
  token("+=", "operator"),
  token("=", "operator"),
  token("!", "operator"),
  token("<", "operator"),
  token(">", "operator"),
  token("(", "punctuation.bracket"),
  token(")", "punctuation.bracket"),
];

export default defineGrammar({
  name: "kconfig",
  aliases: ["Kconfig", "kconf"],
  tabStop: 8,
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          word,
          bytes(word),
          lookahead(
            bytes(" \t", { min: 0 }),
            choice([literal(":=")], [literal("+=")], [literal("=")]),
          ),
          paint("property"),
          setState("assignment"),
        ),
        words,
        ...code,
      ],
    },
    line: {
      style: "plain",
      arms: [token("\n", "plain", setState("root")), expressionWord, ...code],
    },
    assignment: {
      style: "plain",
      arms: [
        token(":=", "operator", setState("assignmentValue")),
        token("+=", "operator", setState("assignmentValue")),
        token("=", "operator", setState("assignmentValue")),
        token("\n", "plain", setState("root")),
      ],
    },
    assignmentValue: {
      style: "string",
      arms: [expansion, lineContinuation, token("\n", "plain", setState("root"))],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    doubleString: {
      style: "string",
      arms: [expansion, escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    singleString: {
      style: "string",
      arms: [expansion, escape, token("'", "string", popState()), redispatch("\n", popState())],
    },
    macro: {
      style: "variable",
      arms: [
        expansion,
        token("(", "punctuation.bracket", pushState("macroParen")),
        token(")", "punctuation.special", popState()),
        escape,
        redispatch("\n", popState()),
      ],
    },
    macroParen: {
      style: "variable",
      arms: [
        expansion,
        token("(", "punctuation.bracket", pushState("macroParen")),
        token(")", "punctuation.bracket", popState()),
        escape,
        redispatch("\n", popState()),
      ],
    },
    helpTail: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState("helpFirst")),
      ],
    },
    // Unlike Linux's lexer, an unindented first help line is treated as code.
    helpFirst: {
      style: "plain",
      arms: [
        on(
          " \t",
          bytes(" \t"),
          lookahead(byte(nonspace)),
          saveColumn(indent),
          paint("string"),
          setState("helpText"),
        ),
        on(" \t", bytes(" \t"), lookahead(byte("\r\n")), paint("string")),
        token("\n", "string"),
      ],
      otherwise: [setState("root")],
    },
    helpText: { style: "string", arms: [token("\n", "string", setState("helpLine"))] },
    helpLine: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), lookahead(byte("\r\n")), paint("string")),
        token("\n", "string"),
        on(
          " \t",
          indentTo(indent),
          bytes(" \t", { min: 0 }),
          byte(nonspace),
          paint("string"),
          setState("helpText"),
        ),
      ],
      otherwise: [setState("root")],
    },
  },
});
