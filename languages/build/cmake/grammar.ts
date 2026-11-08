import {
  byte,
  bytes,
  byteSet,
  character,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  matchRun,
  notNext,
  on,
  oneOf,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const start = union("_", range("a", "z"), range("A", "Z"));
const word = union(start, range("0", "9"));
const level = slot.run("bracketLevel");
const control = `
  if elseif else endif foreach endforeach while endwhile function endfunction macro endmacro block
  endblock
`
  .trim()
  .split(/\s+/);
const conditions = `
  AND OR NOT COMMAND POLICY TARGET TEST DEFINED EXISTS IS_NEWER_THAN IS_READABLE IS_WRITABLE
  IS_EXECUTABLE IS_DIRECTORY IS_SYMLINK IS_ABSOLUTE IN_LIST MATCHES LESS GREATER EQUAL LESS_EQUAL
  GREATER_EQUAL STRLESS STRGREATER STREQUAL STRLESS_EQUAL STRGREATER_EQUAL VERSION_LESS
  VERSION_GREATER VERSION_EQUAL VERSION_LESS_EQUAL VERSION_GREATER_EQUAL PATH_EQUAL
`
  .trim()
  .split(/\s+/);
const commandCases = [
  ...["if", "elseif", "while"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("conditionOpen")],
  })),
  ...["function", "macro"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("definitionOpen")],
  })),
  ...control
    .filter((text) => !["if", "elseif", "while", "function", "macro"].includes(text))
    .map((text) => ({ text, then: [paint("keyword"), pushState("commandOpen")] })),
];
const bracketOpen = (prefix: string, style: "string" | "comment", state: string) =>
  on(
    prefix[0]!,
    literal(prefix),
    bytes("="),
    lookahead(literal("[")),
    saveRun(level),
    paint(style),
    pushState(state),
  );
const comments = [
  bracketOpen("#[", "comment", "bracketCommentOpen"),
  token("#[[", "comment", pushState("bracketComment0")),
  token("#", "comment", pushState("lineComment")),
];
const brackets = [
  bracketOpen("[", "string", "bracketStringOpen"),
  token("[[", "string", pushState("bracketString0")),
];
const expansion = [
  ...["${", "$ENV{", "$CACHE{"].map((opener) =>
    token(opener, "punctuation.special", pushState("variable")),
  ),
  token("$<", "punctuation.special", pushState("generator")),
];
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const common = [
  ...comments,
  ...brackets,
  token('"', "string", pushState("quoted")),
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
];
// Condition operators are recognized only in if/elseif/while arguments; quoted and expanded words are not operators.
// Escapes are styled lexically, including invalid escapes; legacy unquoted arguments are not parsed separately.
// Generator expressions are lexical, not evaluated.
const conditionBoundary = except(byteSet({ ranges: [[0, 255]] }), " \t\r\n()");
const conditionWords = on(
  start,
  previousNotIn(conditionBoundary),
  byte(start),
  bytes(word, { min: 0 }),
  notNext(conditionBoundary),
  classify(keywordTable(conditions, "keyword"), [paint("plain")]),
);

export default defineGrammar({
  name: "cmake",
  extensions: ["cmake"],
  filenames: ["CMakeLists.txt"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...comments,
        on(
          start,
          previousNotIn(word),
          byte(start),
          bytes(word, { min: 0 }),
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          classify(commandCases, [paint("function"), pushState("commandOpen")], {
            caseless: true,
          }),
        ),
      ],
    },
    commandOpen: {
      style: "plain",
      arms: [token("(", "punctuation.bracket", setState("arguments")), ...comments],
    },
    conditionOpen: {
      style: "plain",
      arms: [token("(", "punctuation.bracket", setState("condition")), ...comments],
    },
    definitionOpen: {
      style: "plain",
      arms: [token("(", "punctuation.bracket", setState("definitionName")), ...comments],
    },
    definitionName: {
      style: "plain",
      arms: [
        ...comments,
        on(start, byte(start), bytes(word, { min: 0 }), paint("function"), setState("arguments")),
        token(")", "punctuation.bracket", popState()),
      ],
    },
    arguments: {
      style: "plain",
      arms: [
        ...common,
        token("(", "punctuation.bracket", pushState("arguments")),
        token(")", "punctuation.bracket", popState()),
      ],
      otherwise: [pushState("unquoted")],
    },
    condition: {
      style: "plain",
      arms: [
        ...common,
        conditionWords,
        token("(", "punctuation.bracket", pushState("condition")),
        token(")", "punctuation.bracket", popState()),
      ],
      otherwise: [pushState("unquoted")],
    },
    unquoted: {
      style: "plain",
      arms: [...expansion, escape, redispatch(' \t\r\n()#"', popState())],
    },
    quoted: { style: "string", arms: [escape, ...expansion, token('"', "string", popState())] },
    variable: {
      style: "variable",
      arms: [...expansion, escape, token("}", "punctuation.special", popState())],
    },
    generator: {
      style: "plain",
      arms: [
        ...expansion,
        token(">", "punctuation.special", popState()),
        token(oneOf(":,"), "punctuation.delimiter"),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    bracketStringOpen: { style: "string", arms: [token("[", "string", setState("bracketString"))] },
    bracketString: {
      style: "string",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(level, { relation: "exact" }),
          literal("]"),
          paint("string"),
          popState(),
        ),
      ],
    },
    bracketString0: { style: "string", arms: [token("]]", "string", popState())] },
    bracketCommentOpen: {
      style: "comment",
      arms: [token("[", "comment", setState("bracketComment"))],
    },
    bracketComment: {
      style: "comment",
      arms: [
        on(
          "]",
          literal("]"),
          matchRun(level, { relation: "exact" }),
          literal("]"),
          paint("comment"),
          popState(),
        ),
      ],
    },
    bracketComment0: { style: "comment", arms: [token("]]", "comment", popState())] },
  },
});
