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
  lookahead,
  matchRun,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  saveRun,
  setState,
  slot,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const letter = union(range("a", "z"), range("A", "Z"), "_", byteSet({ ranges: [[128, 255]] }));
const digit = range("0", "9");
const name = union(letter, digit, "-");
const hashes = slot.run("raw-hashes", { scope: "frame" });
const keywords = `
    def export let mut const if else match for in while loop break continue return try catch use
    module overlay alias extern source hide do
  `
  .trim()
  .split(/\s+/);
const operators = `
  and or xor not in not-in like not-like starts-with ends-with mod
`
  .trim()
  .split(/\s+/);
const constants = ["true", "false", "null"];
// Built-in command families whose next bare word is a subcommand.
const namespaces = `
    bits bytes date debug decode encode format from hash http input into math path query random
    split str sys to url
  `
  .trim()
  .split(/\s+/);
const quotedKey = choice(
  [literal("'"), bytes(except(all, "'\n"), { min: 0 }), literal("'")],
  [
    literal('"'),
    repeat(choice([literal("\\"), character()], [byte(except(all, '\\"\n'))])),
    literal('"'),
  ],
);
const keySuffix = lookahead(bytes(" \t", { min: 0 }), literal(":"));
const twoDigits = () => bytes(digit, { min: 2, max: 2 });
const date = on(
  digit,
  bytes(digit, { min: 4, max: 4 }),
  literal("-"),
  twoDigits(),
  literal("-"),
  twoDigits(),
  optional(
    byte("Tt"),
    twoDigits(),
    literal(":"),
    twoDigits(),
    literal(":"),
    twoDigits(),
    optional(literal("."), bytes(digit)),
    choice([byte("Zz")], [byte("+-"), twoDigits(), literal(":"), twoDigits()]),
  ),
  notNext(union(letter, digit, "-")),
  paint("number"),
);
const variable = on(
  "$",
  literal("$"),
  bytes(union(letter, digit)),
  paint("variable"),
  pushState("path"),
);
const number = on(
  digit,
  bytes(union(digit, "_")),
  optional(literal("."), bytes(union(digit, "_"))),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  optional(bytes(letter)),
  paint("number"),
);

// Command position and key recognition are lexical: a word or quoted string
// immediately before ':' is treated as a record key outside signatures. Dates
// recognize ISO shape, not calendar validity. Closing delimiters unwind the
// innermost group even when mismatched.
function code(
  position: "command" | "argument",
  context: "ordinary" | "interpolation" = "ordinary",
): State {
  const contexts = {
    ordinary: { command: "command", args: "args", namespace: "namespace" },
    interpolation: {
      command: "interpolationCommand",
      args: "interpolationArgs",
      namespace: "interpolationNamespace",
    },
  } as const;
  const { command: commandState, args: argsState, namespace: namespaceState } = contexts[context];
  const commandAttributes: Arm[] = [];
  const interpolationEnd: Arm[] = [];
  if (position === "command") {
    commandAttributes.push(
      on(
        "@",
        literal("@"),
        byte(letter),
        bytes(name, { min: 0 }),
        paint("attribute"),
        setState(argsState),
      ),
    );
  }
  if (context === "interpolation") {
    interpolationEnd.push(token(")", "punctuation.special", popState()));
  }
  const namespaceCases =
    position === "command"
      ? keywordTable(namespaces, "function", () => [setState(namespaceState)])
      : [];
  return {
    style: "plain",
    arms: [
      on(" \t\r", bytes(" \t\r"), paint("plain")),
      token("\n", "plain", setState(commandState)),
      token("#", "comment", pushState("comment")),
      token(";", "punctuation.delimiter", setState(commandState)),
      token("|", "operator", setState(commandState)),
      ...commandAttributes,
      on(
        "r",
        literal("r"),
        bytes("#"),
        lookahead(byte("'\"")),
        paint("string"),
        setState(argsState),
        pushState("rawStart"),
        saveRun(hashes),
      ),
      on("'\"", quotedKey, keySuffix, paint("property"), setState(argsState)),
      token('$"', "punctuation.special", setState(argsState), pushState("interpolatedDouble")),
      token("$'", "punctuation.special", setState(argsState), pushState("interpolatedSingle")),
      token('"', "string", setState(argsState), pushState("double")),
      token("'", "string", setState(argsState), pushState("single")),
      token("`", "string", setState(argsState), pushState("backtick")),
      variable,
      date,
      number,
      on(
        "-",
        literal("-"),
        optional(literal("-")),
        byte(letter),
        bytes(name, { min: 0 }),
        paint("attribute"),
      ),
      token("{|", "punctuation.bracket", setState(argsState), pushState("closureParameters")),
      on("[", literal("["), paint("punctuation.bracket"), setState(argsState), pushState("args")),
      on("({", byte("({"), paint("punctuation.bracket"), setState(argsState), pushState("command")),
      ...interpolationEnd,
      on(")]}", byte(")]}"), paint("punctuation.bracket"), popState()),
      token("..<", "operator"),
      token("..", "operator"),
      on(
        "=!<>+*/%-",
        choice(
          ...`
            =~ !~ == != <= >= ++ // ** -> += -= *= /=
          `
            .trim()
            .split(/\s+/)
            .map((operator) => [literal(operator)]),
          [byte("=!<>+*/%-")],
        ),
        paint("operator"),
      ),
      on(",:", byte(",:"), paint("punctuation.delimiter")),
      on(".", literal("."), paint("punctuation.delimiter"), pushState("member")),
      on(
        letter,
        byte(letter),
        bytes(name, { min: 0 }),
        keySuffix,
        paint("property"),
        setState(argsState),
      ),
      on(
        letter,
        byte(letter),
        bytes(name, { min: 0 }),
        classify(
          [
            ...keywordTable(["def", "extern", "alias"], "keyword", () => [setState("definition")]),
            ...namespaceCases,
            ...keywordTable(
              keywords.filter((word) => !["def", "extern", "alias", "in"].includes(word)),
              "keyword",
              () => [setState(argsState)],
            ),
            ...keywordTable(operators, "operator"),
            ...keywordTable(constants, "constant.builtin", () => [setState(argsState)]),
          ],
          [paint(position === "command" ? "function" : "plain"), setState(argsState)],
        ),
      ),
    ],
  };
}

export default defineGrammar({
  name: "nushell",
  extensions: ["nu"],
  aliases: ["nu"],
  initial: "command",
  states: {
    command: code("command"),
    args: code("argument"),
    definition: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on("-", literal("--env"), notNext(name), paint("attribute")),
        on("'\"", quotedKey, paint("function"), setState("signatureStart")),
        on(
          letter,
          byte(letter),
          bytes(name, { min: 0 }),
          paint("function"),
          setState("signatureStart"),
        ),
        redispatch(all, setState("args")),
      ],
    },
    namespace: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("function"), setState("args")),
        redispatch(all, setState("args")),
      ],
    },
    interpolationNamespace: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(
          letter,
          byte(letter),
          bytes(name, { min: 0 }),
          paint("function"),
          setState("interpolationArgs"),
        ),
        redispatch(all, setState("interpolationArgs")),
      ],
    },
    signatureStart: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("[", "punctuation.bracket", pushState("signature")),
        token(":", "punctuation.delimiter", setState("signatureIOStart")),
        token("->", "operator", setState("signatureResult")),
        redispatch(all, setState("args")),
      ],
    },
    signature: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("#", "comment", pushState("comment")),
        token("]", "punctuation.bracket", popState()),
        token("...", "punctuation.delimiter"),
        token("?", "punctuation.special"),
        token(":", "punctuation.delimiter", pushState("signatureType")),
        on(
          "-",
          literal("-"),
          optional(literal("-")),
          byte(letter),
          bytes(name, { min: 0 }),
          paint("attribute"),
        ),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("variable")),
        on("()", byte("()"), paint("punctuation.bracket")),
        on(",=", byte(",="), paint("punctuation.delimiter")),
      ],
    },
    signatureIOStart: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("[", "punctuation.bracket", setState("args"), pushState("signatureIOList")),
        redispatch(all, setState("signatureIOPair")),
      ],
    },
    signatureIOPair: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("type")),
        token("<", "punctuation.bracket", pushState("genericType")),
        token("->", "operator"),
        redispatch(all, setState("args")),
      ],
    },
    signatureIOList: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("#", "comment", pushState("comment")),
        token("]", "punctuation.bracket", popState()),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("type")),
        token("<", "punctuation.bracket", pushState("genericType")),
        token("->", "operator"),
        token(",", "punctuation.delimiter"),
      ],
    },
    signatureResult: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("type")),
        token("<", "punctuation.bracket", pushState("genericType")),
        redispatch(all, setState("args")),
      ],
    },
    signatureType: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("type")),
        token("<", "punctuation.bracket", pushState("genericType")),
        redispatch(all, popState()),
      ],
    },
    genericType: {
      style: "plain",
      arms: [
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("type")),
        token("<", "punctuation.bracket", pushState("genericType")),
        token(">", "punctuation.bracket", popState()),
        on(",:", byte(",:"), paint("punctuation.delimiter")),
      ],
    },
    closureParameters: {
      style: "plain",
      arms: [
        token("|", "punctuation.bracket", setState("command")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("variable")),
        token(",", "punctuation.delimiter"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    single: { style: "string", arms: [token("'", "string", popState())] },
    backtick: { style: "string", arms: [token("`", "string", popState())] },
    double: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    interpolatedDouble: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "punctuation.special", popState()),
        token("(", "punctuation.special", pushState("interpolationCommand")),
      ],
    },
    interpolatedSingle: {
      style: "string",
      arms: [
        token("'", "punctuation.special", popState()),
        token("(", "punctuation.special", pushState("interpolationCommand")),
      ],
    },
    interpolationCommand: code("command", "interpolation"),
    interpolationArgs: code("argument", "interpolation"),
    rawStart: {
      style: "string",
      arms: [
        token("'", "string", setState("rawSingle")),
        token('"', "string", setState("rawDouble")),
      ],
      otherwise: [popState()],
    },
    rawSingle: {
      style: "string",
      arms: [
        on("'", literal("'"), matchRun(hashes, { relation: "exact" }), paint("string"), popState()),
      ],
    },
    rawDouble: {
      style: "string",
      arms: [
        on('"', literal('"'), matchRun(hashes, { relation: "exact" }), paint("string"), popState()),
      ],
    },
    path: {
      style: "plain",
      arms: [token(".", "punctuation.delimiter", pushState("member"))],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [
        on(
          union(letter, digit),
          bytes(union(name, digit)),
          optional(literal("?")),
          paint("variable.member"),
          popState(),
        ),
        redispatch(all, popState()),
      ],
    },
  },
});
