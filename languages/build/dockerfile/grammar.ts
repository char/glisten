import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  openInjection,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  setState,
  shell,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const letter = union(range("a", "z"), range("A", "Z"), "_");
const name = union(letter, range("0", "9"));
const word = union(name, "-");
const nonLine = byteSet({
  ranges: [
    [0, 9],
    [11, 12],
    [14, 255],
  ],
});
const instructions =
  "add arg cmd copy entrypoint env expose from healthcheck label maintainer onbuild run shell stopsignal user volume workdir".split(
    " ",
  );

function states(suffix: string, escape: string): Record<string, State> {
  const root = `root${suffix}`;
  const start = `start${suffix}`;
  const directiveEnd = `directiveEnd${suffix}`;
  const args = `args${suffix}`;
  const arg = `arg${suffix}`;
  const argsJson = `argsJson${suffix}`;
  const run = `run${suffix}`;
  const command = `command${suffix}`;
  const flagEquals = `flagEquals${suffix}`;
  const flagValue = `flagValue${suffix}`;
  const shellState = `shell${suffix}`;
  const shellContinued = `shellContinued${suffix}`;
  const json = `json${suffix}`;
  const jsonString = `jsonString${suffix}`;
  const from = `from${suffix}`;
  const stage = `stage${suffix}`;
  const heredocHeader = `heredocHeader${suffix}`;
  const heredocBody = `heredocBody${suffix}`;
  const heredocStripHeader = `heredocStripHeader${suffix}`;
  const heredocStripBody = `heredocStripBody${suffix}`;
  const expansion = `expansion${suffix}`;
  const expansionTail = `expansionTail${suffix}`;
  const doubleString = `doubleString${suffix}`;
  const singleString = `singleString${suffix}`;
  const unknown = `unknown${suffix}`;
  const variables = [
    token("${", "punctuation.special", pushState(expansion)),
    on("$", literal("$"), byte(letter), bytes(name, { min: 0 }), paint("variable")),
  ];
  const continuation = on(
    escape,
    literal(escape),
    optional(literal("\r")),
    literal("\n"),
    paint("string.escape"),
  );
  const end = token("\n", "plain", setState(root));
  const flag = on("-", literal("--"), byte(letter), bytes(word, { min: 0 }), paint("attribute"));
  const equals = token("=", "operator");
  const runArms = (context: "run" | "command") => [
    continuation,
    end,
    on(
      "-",
      literal("--"),
      byte(letter),
      bytes(word, { min: 0 }),
      paint("attribute"),
      setState(flagEquals),
    ),
    on(" \t", bytes(" \t"), lookahead(literal("[")), paint("plain"), setState(json)),
    // Embedded and multiple heredocs require shell-aware tokenization, not just a delimiter queue.
    // A continuation before RUN flags or the heredoc opener starts Bash injection too early.
    ...(context === "run"
      ? [
          on(
            " \t",
            bytes(" \t"),
            lookahead(literal("<<-")),
            paint("plain"),
            setState(heredocStripHeader),
          ),
          on(
            " \t",
            bytes(" \t"),
            lookahead(literal("<<")),
            paint("plain"),
            setState(heredocHeader),
          ),
        ]
      : []),
    on(" \t", bytes(" \t"), lookahead(literal("--"), byte(letter)), paint("plain")),
    // SHELL overrides are not tracked: shell-form instructions always use Bash.
    on(
      " \t",
      bytes(" \t"),
      paint("plain"),
      openInjection({ static: "bash" }),
      setState(shellState),
    ),
  ];
  const values = [
    ...variables,
    on(letter, byte(letter), bytes(name, { min: 0 }), lookahead(literal("=")), paint("variable")),
    equals,
    token('"', "string", pushState(doubleString)),
    token("'", "string", pushState(singleString)),
  ];
  const headerState = (body: string): State => ({
    style: "label",
    arms: [
      on(
        "<",
        literal("<<"),
        optional(literal("-")),
        paint("punctuation.special"),
        shell.captureReset(),
      ),
      token(oneOf("\"'"), "label"),
      on(
        except(all, " \t\r\n\"'"),
        bytes(except(all, " \t\r\n\"'")),
        paint("label"),
        shell.captureAppend(),
      ),
      on("\n", literal("\n"), paint("plain"), openInjection({ static: "bash" }), setState(body)),
    ],
  });
  // Delimiters longer than the 256-byte shell capture cannot be recognized.
  const bodyState = (indentation: "literal" | "strip-tabs"): State => ({
    style: "plain",
    arms: [
      on(
        all,
        lineStart(),
        ...(indentation === "strip-tabs" ? [bytes("\t", { min: 0 })] : []),
        shell.captured(),
        optional(literal("\r")),
        lineEnd(),
        closeInjection(),
        paint("label"),
        setState(root),
      ),
    ],
  });
  const escapeDirective = [byte("eE"), byte("sS"), byte("cC"), byte("aA"), byte("pP"), byte("eE")];
  const syntaxDirective = [byte("sS"), byte("yY"), byte("nN"), byte("tT"), byte("aA"), byte("xX")];
  const checkDirective = [byte("cC"), byte("hH"), byte("eE"), byte("cC"), byte("kK")];
  return {
    // Repeated directive keys and invalid syntax/check values are not distinguished here.
    [start]: {
      style: "plain",
      arms: [
        on(
          " \t#",
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("#"),
          bytes(" \t", { min: 0 }),
          ...escapeDirective,
          bytes(" \t", { min: 0 }),
          literal("="),
          bytes(" \t", { min: 0 }),
          literal("`"),
          bytes(" \t\r", { min: 0 }),
          lineEnd(),
          paint("comment"),
          setState("directiveEndTick"),
        ),
        on(
          " \t#",
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("#"),
          bytes(" \t", { min: 0 }),
          ...escapeDirective,
          bytes(" \t", { min: 0 }),
          literal("="),
          bytes(" \t", { min: 0 }),
          literal("\\"),
          bytes(" \t\r", { min: 0 }),
          lineEnd(),
          paint("comment"),
          setState("directiveEnd"),
        ),
        on(
          " \t#",
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("#"),
          bytes(" \t", { min: 0 }),
          choice(syntaxDirective, checkDirective),
          bytes(" \t", { min: 0 }),
          literal("="),
          bytes(nonLine),
          optional(literal("\r")),
          lineEnd(),
          paint("comment"),
          setState(directiveEnd),
        ),
        redispatch(all, setState(root)),
      ],
    },
    [directiveEnd]: { style: "plain", arms: [token("\n", "plain", setState(start))] },
    [root]: {
      style: "plain",
      otherwise: unknown,
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("\n", "plain"),
        on("#", literal("#"), bytes(nonLine, { min: 0 }), paint("comment")),
        on(
          letter,
          byte(letter),
          bytes(word, { min: 0 }),
          notNext(word),
          lookahead(choice([byte(" \t\r\n")], [lineEnd()])),
          classify(
            instructions.map((text) => ({
              text,
              then: [
                paint("keyword"),
                setState(
                  text === "from"
                    ? from
                    : text === "arg"
                      ? arg
                      : text === "onbuild"
                        ? root
                        : text === "run"
                          ? run
                          : ["cmd", "entrypoint"].includes(text)
                            ? command
                            : ["copy", "add", "volume", "shell"].includes(text)
                              ? argsJson
                              : args,
                ),
              ],
            })),
            [paint("plain"), setState(unknown)],
            { caseless: true },
          ),
        ),
      ],
    },
    [unknown]: { style: "plain", arms: [end] },
    [arg]: {
      style: "plain",
      arms: [
        continuation,
        end,
        on(" \t", bytes(" \t"), paint("plain")),
        on(letter, byte(letter), bytes(name, { min: 0 }), paint("variable"), setState(args)),
      ],
    },
    [args]: { style: "string", arms: [continuation, end, flag, ...values] },
    [argsJson]: {
      style: "string",
      arms: [
        continuation,
        end,
        flag,
        on(" \t", bytes(" \t"), lookahead(literal("[")), paint("plain"), setState(json)),
        ...values,
      ],
    },
    [from]: {
      style: "string",
      arms: [
        continuation,
        end,
        flag,
        ...variables,
        equals,
        on(
          "aA",
          previousNotIn(except(all, " \t")),
          byte("aA"),
          byte("sS"),
          lookahead(choice([byte(" \t\r\n")], [lineEnd()])),
          paint("keyword"),
          setState(stage),
        ),
      ],
    },
    [stage]: { style: "label", arms: [continuation, end, ...variables] },
    [run]: { style: "plain", arms: runArms("run") },
    [command]: { style: "plain", arms: runArms("command") },
    [flagEquals]: {
      style: "plain",
      arms: [token("=", "operator", setState(flagValue)), end],
      otherwise: [setState(run)],
    },
    [flagValue]: {
      style: "string",
      arms: [
        on(except(all, " \t\r\n"), bytes(except(all, " \t\r\n")), paint("string"), setState(run)),
        end,
      ],
      otherwise: [setState(run)],
    },
    [shellState]: {
      style: "plain",
      arms: [
        on(
          escape,
          literal(escape),
          optional(literal("\r")),
          literal("\n"),
          hostPrefix(),
          paint("string.escape"),
          setState(shellContinued),
        ),
        on("\n", literal("\n"), closeInjection(), paint("plain"), setState(root)),
      ],
    },
    [shellContinued]: {
      style: "plain",
      arms: [
        on(
          " \t\r\n",
          lineStart(),
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          literal("\n"),
          hostPrefix(),
          paint("plain"),
        ),
        on(
          " \t#",
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("#"),
          bytes(nonLine, { min: 0 }),
          optional(literal("\r")),
          optional(literal("\n")),
          hostPrefix(),
          paint("comment"),
        ),
        redispatch(all, setState(shellState)),
      ],
    },
    [json]: {
      style: "plain",
      arms: [
        continuation,
        end,
        token(oneOf("[]"), "punctuation.bracket"),
        token(",", "punctuation.delimiter"),
        token('"', "string", pushState(jsonString)),
      ],
    },
    [jsonString]: {
      style: "string",
      arms: [
        on("\\", literal("\\"), byte(all), paint("string.escape")),
        token('"', "string", popState()),
        token("\n", "plain", popState(), setState(root)),
      ],
    },
    [heredocHeader]: headerState(heredocBody),
    [heredocStripHeader]: headerState(heredocStripBody),
    [heredocBody]: bodyState("literal"),
    [heredocStripBody]: bodyState("strip-tabs"),
    [expansion]: {
      style: "string",
      arms: [
        token("}", "punctuation.special", popState()),
        on(
          letter,
          byte(letter),
          bytes(name, { min: 0 }),
          paint("variable"),
          setState(expansionTail),
        ),
        token("\n", "plain", popState(), setState(root)),
      ],
    },
    [expansionTail]: {
      style: "string",
      arms: [
        token("}", "punctuation.special", popState()),
        on(":-+?", bytes(":-+?"), paint("punctuation.special")),
        token("\n", "plain", popState(), setState(root)),
        ...variables,
      ],
    },
    [doubleString]: {
      style: "string",
      arms: [
        token('"', "string", popState()),
        on("\\", literal("\\"), byte(except(all, "\n")), paint("string.escape")),
        token("\n", "plain", popState(), setState(root)),
        ...variables,
      ],
    },
    [singleString]: {
      style: "string",
      arms: [token("'", "string", popState()), token("\n", "plain", popState(), setState(root))],
    },
  };
}

export default defineGrammar({
  name: "dockerfile",
  aliases: ["docker", "containerfile"],
  initial: "start",
  states: {
    ...states("", "\\"),
    ...states("Tick", "`"),
  },
});
