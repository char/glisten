import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
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
  setState,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const letter = union(range("a", "z"), range("A", "Z"));
const digit = range("0", "9");
const wordRest = union(letter, digit, "_");
const word = [byte(letter), bytes(wordRest, { min: 0 })];
const varBody = except(all, "%\r\n");
const delayedBody = except(all, "!\r\n");
const labelBody = except(all, " \t\r\n&|<>()");
const labelFirst = except(labelBody, "\\/");
const controls = "if for in do else not exist defined errorlevel".split(" ");
const comparisons = "equ neq lss leq gtr geq".split(" ");
const builtins =
  `assoc break call cd chdir cls color copy date del dir echo endlocal erase exit ftype goto md mkdir mklink move path pause popd prompt pushd rd ren rename rmdir set setlocal shift start time title type ver verify vol`.split(
    /\s+/,
  );
const argsCases = [
  ...keywordTable(controls, "keyword"),
  ...keywordTable(comparisons, "operator"),
  ...keywordTable(builtins, "function"),
  ...keywordTable(
    ["enabledelayedexpansion", "disabledelayedexpansion", "enableextensions", "disableextensions"],
    "attribute",
  ),
];
const commandCases = [
  { text: "rem", then: [paint("comment" as const), pushState("comment")] },
  { text: "for", then: [paint("keyword" as const), setState("forArgs")] },
  { text: "set", then: [paint("function" as const), setState("setArgs")] },
  ...keywordTable(
    controls.filter((word) => word !== "for"),
    "keyword",
  ).map((item) => ({
    ...item,
    then: [...item.then, setState("args")],
  })),
  ...keywordTable(
    builtins.filter((word) => word !== "set"),
    "function",
  ).map((item) => ({
    ...item,
    then: [...item.then, setState("args")],
  })),
];
const variables = [
  on("%", literal("%%~"), bytes(union(letter, digit, "_$:")), paint("variable")),
  on("%", literal("%%"), byte(letter), paint("variable")),
  token("%%", "string.escape"),
  on(
    "%",
    literal("%~"),
    bytes(union(letter, "_$:"), { min: 0 }),
    byte(union(digit, "*")),
    paint("variable"),
  ),
  on("%", literal("%"), byte(union(digit, "*")), paint("variable")),
  on("%", literal("%"), bytes(varBody), literal("%"), paint("variable")),
  on("!", literal("!"), bytes(delayedBody), literal("!"), paint("variable")),
];
const escape = on(
  "^",
  literal("^"),
  choice([literal("\r\n")], [character()]),
  paint("string.escape"),
);
const redirect = on(
  "0123456789<>",
  optional(bytes(digit)),
  choice([literal(">>")], [literal(">")], [literal("<")]),
  optional(literal("&"), choice([bytes(digit)], [literal("-")])),
  paint("operator"),
);
const label = on(":", literal(":"), byte(labelFirst), bytes(labelBody, { min: 0 }), paint("label"));
const arithmetic = [
  ...variables,
  on(
    "0",
    literal("0"),
    byte("xX"),
    bytes(union(digit, range("a", "f"), range("A", "F"))),
    paint("number"),
  ),
  on("0123456789", bytes(digit), paint("number")),
  on(letter, ...word, paint("variable")),
  ...["<<=", ">>=", "<<", ">>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^="].map((op) =>
    token(op, "operator"),
  ),
  token(oneOf("=+-*/%&|^~"), "operator"),
];
const common = [
  on(" \t\r", bytes(" \t\r"), paint("plain")),
  ...variables,
  escape,
  redirect,
  on(
    "|&",
    choice([literal("&&")], [literal("||")], [literal("|")], [literal("&")]),
    paint("operator"),
    setState("command"),
  ),
  token("(", "punctuation.bracket", setState("command")),
  token(")", "punctuation.bracket", setState("args")),
  token('"', "string", pushState("quoted")),
  token("\n", "plain", setState("command")),
];

export default defineGrammar({
  name: "batch",
  aliases: ["bat", "cmd", "dosbatch"],
  initial: "command",
  states: {
    command: {
      style: "plain",
      arms: [
        ...common,
        token("@", "punctuation.special"),
        on(":", literal("::"), paint("comment"), pushState("comment")),
        label,
        on(
          letter,
          ...word,
          classify(commandCases, [paint("function"), setState("args")], { caseless: true }),
        ),
      ],
    },
    args: {
      style: "plain",
      arms: [
        ...common,
        label,
        on("/", literal("/"), byte(letter), notNext(wordRest), paint("attribute")),
        on(letter, ...word, classify(argsCases, [paint("plain")], { caseless: true })),
        token("==", "operator"),
      ],
    },
    setArgs: {
      style: "plain",
      arms: [
        on(
          "/",
          literal("/"),
          byte("aA"),
          notNext(wordRest),
          paint("attribute"),
          setState("arithmetic"),
        ),
        on("/", literal("/"), byte(letter), notNext(wordRest), paint("attribute")),
        ...common,
        token("=", "operator"),
        on(letter, ...word, paint("variable")),
      ],
    },
    arithmetic: {
      style: "plain",
      arms: [
        token('"', "string", pushState("arithmeticQuoted")),
        token("(", "punctuation.bracket", pushState("arithmeticGroup")),
        ...common,
        ...arithmetic,
      ],
    },
    arithmeticGroup: {
      style: "plain",
      arms: [
        token("(", "punctuation.bracket", pushState("arithmeticGroup")),
        token(")", "punctuation.bracket", popState()),
        ...common,
        ...arithmetic,
      ],
    },
    arithmeticQuoted: {
      style: "string",
      arms: [
        ...arithmetic,
        token(oneOf("()"), "punctuation.bracket"),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    forArgs: {
      style: "plain",
      arms: [
        ...common,
        on("/", literal("/"), byte(letter), notNext(wordRest), paint("attribute")),
        on(
          letter,
          ...word,
          classify(
            [{ text: "in", then: [paint("keyword"), setState("forIn")] }],
            [paint("plain")],
            { caseless: true },
          ),
        ),
      ],
    },
    forIn: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("(", "punctuation.bracket", setState("forList")),
      ],
      otherwise: [setState("args")],
    },
    forList: {
      style: "plain",
      arms: [
        ...variables,
        escape,
        token('"', "string", pushState("quoted")),
        token(")", "punctuation.bracket", setState("forDo")),
      ],
    },
    forDo: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(
          letter,
          ...word,
          classify(
            [{ text: "do", then: [paint("keyword"), setState("command")] }],
            [paint("plain"), setState("args")],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [setState("args")],
    },
    quoted: {
      style: "string",
      arms: [...variables, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState(), setState("command"))] },
  } satisfies Record<string, State>,
});
