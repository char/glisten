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
const name = union(
  "_",
  range("a", "z"),
  range("A", "Z"),
  range("0", "9"),
  byteSet({ ranges: [[128, 255]] }),
);
const bare = except(all, " \t\r\n;|&<>()'\"$\\{}*?^");
const optionStart = union(range("a", "z"), range("A", "Z"));
const keywords = `
  begin break case continue end for function return switch
`
  .trim()
  .split(/\s+/);
const commandKeywords = `and else if not or while`.trim().split(/\s+/);
const builtins = `
  argparse bg bind block breakpoint builtin cd command commandline complete contains count
  disown echo emit eval exec exit false fg functions history isatty jobs math path printf pwd
  random read realpath set set_color source status string test time trap true type ulimit umask
  wait
`
  .trim()
  .split(/\s+/);
const variables = on("$", bytes("$"), bytes(name), paint("variable"), pushState("indexProbe"));
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const parts = [
  token("$(", "punctuation.special", pushState("subCommand")),
  token("(", "punctuation.special", pushState("subCommand")),
  variables,
  token("'", "string", pushState("single")),
  token('"', "string", pushState("double")),
  escape,
  token(oneOf("{}"), "punctuation.bracket"),
  token(oneOf("*?"), "operator"),
];
const redirect = on(
  "0123456789<>^",
  optional(bytes(range("0", "9"))),
  choice(...[">>?", ">>", ">?", ">", "<", "^^", "^"].map((operator) => [literal(operator)])),
  optional(literal("&"), choice([bytes(range("0", "9"))], [literal("-")])),
  paint("operator"),
);

// Command position is tracked lexically, not through complete fish block syntax;
// in is highlighted in every argument position, and compound command names are not classified as a whole.
// Non-ASCII bytes are accepted in variable names without Unicode character checks.
// Options are recognized lexically; braces and wildcards are colored even when not expansions.
// Unquoted numeric escapes color only their backslash and first character; ranges are not validated.
function commandStates(scope: "root" | "subshell"): { command: State; args: State } {
  const states = {
    root: { command: "command", args: "args" },
    subshell: { command: "subCommand", args: "subArgs" },
  } as const;
  const { command, args } = states[scope];
  const common = [
    on(" \t\r", bytes(" \t\r"), paint("plain")),
    token("#", "comment", pushState("comment")),
    redirect,
    on(
      "|&",
      choice(...["&&", "||", "&|", "|", "&"].map((operator) => [literal(operator)])),
      paint("operator"),
      setState(command),
    ),
    token(";", "punctuation.delimiter", setState(command)),
    token("\n", "plain", setState(command)),
  ];
  if (scope === "subshell") common.push(token(")", "punctuation.special", popState()));
  return {
    command: {
      style: "plain",
      arms: [
        ...common,
        on(
          bare,
          bytes(bare),
          classify(
            [
              ...keywordTable(commandKeywords, "keyword", () => [pushState("word")]),
              ...keywordTable(keywords, "keyword", () => [setState(args), pushState("word")]),
              ...keywordTable(builtins, "function", () => [setState(args), pushState("word")]),
            ],
            [paint("function"), setState(args), pushState("word")],
          ),
        ),
        redispatch("$('\"\\{}*?", setState(args), pushState("word")),
      ],
    },
    args: {
      style: "plain",
      arms: [
        ...common,
        on(
          "-",
          literal("-"),
          optional(literal("-")),
          byte(optionStart),
          bytes(union(name, "-"), { min: 0 }),
          paint("attribute"),
          pushState("word"),
        ),
        on(
          bare,
          bytes(bare),
          classify(
            keywordTable(["in"], "keyword", () => [pushState("word")]),
            [paint("plain"), pushState("word")],
          ),
        ),
        redispatch("$('\"\\{}*?", pushState("word")),
      ],
    },
  };
}

const rootStates = commandStates("root");
const subshellStates = commandStates("subshell");

export default defineGrammar({
  name: "fish",
  extensions: ["fish"],
  initial: "command",
  states: {
    command: rootStates.command,
    args: rootStates.args,
    subCommand: subshellStates.command,
    subArgs: subshellStates.args,
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    word: {
      style: "plain",
      arms: [
        redispatch(" \t\r\n;|&<>^)", popState()),
        ...parts,
        on(bare, bytes(bare), paint("plain")),
      ],
    },
    single: {
      style: "string",
      arms: [
        on("\\", literal("\\"), byte("\\'"), paint("string.escape")),
        token("'", "string", popState()),
      ],
    },
    double: {
      style: "string",
      arms: [
        token('"', "string", popState()),
        token("$(", "punctuation.special", pushState("subCommand")),
        variables,
        on("\\", literal("\\"), byte('\\"$\n'), paint("string.escape")),
      ],
    },
    indexProbe: {
      style: "plain",
      arms: [token("[", "punctuation.bracket", setState("index"))],
      otherwise: [popState()],
    },
    index: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        variables,
        token("..", "operator"),
        on("-0123456789", optional(literal("-")), bytes(range("0", "9")), paint("number")),
        token("(", "punctuation.special", pushState("subCommand")),
      ],
    },
  },
});
