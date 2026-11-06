import {
  type Arm,
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  type Effect,
  hostPrefix,
  keywordTable,
  literal,
  lookahead,
  type Matcher,
  notNext,
  on,
  oneOf,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  resource,
  setState,
  shell,
  token,
  union,
} from "#/grammar/mod.ts";

const keywords =
  "if then else elif fi while until do done in esac function time coproc ! { } for select case".split(
    " ",
  );
const builtins =
  "alias bg bind break builtin caller cd command compgen complete compopt continue declare dirs disown echo enable eval exec exit export false fc fg getopts hash help history jobs kill let local logout mapfile popd printf pushd pwd read readarray readonly return set shift shopt source suspend test times trap true type typeset ulimit umask unalias unset wait".split(
    " ",
  );
const nameStart = union("_", range("a", "z"), range("A", "Z"));
const nameRest = union("_", range("a", "z"), range("A", "Z"), range("0", "9"));
const notNewline = union(range("\x00", "\x09"), byteSet({ ranges: [[11, 255]] }));
const delimiters = " \t\n;|&<>()'\"$`\\";
const bareAscii = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i))
  .filter((c) => !delimiters.includes(c))
  .join("");
const bare = union(bareAscii, byteSet({ ranges: [[128, 255]] }));
const boundary = " \t\n;|&<>()";
const allBytes = byteSet({ ranges: [[0, 255]] });
const continuation = "'\"$`\\";
const special = paint("punctuation.special");
const string = paint("string");
const variable = paint("variable");
const escape = paint("string.escape");

type PartOptions = { beforePaint?: readonly Effect[]; when?: readonly Matcher[] };
const parameters = ({ beforePaint = [], when = [] }: PartOptions = {}): Arm[] => [
  on("$", ...when, literal("${"), ...beforePaint, special, pushState("parameter")),
  on(
    "$",
    ...when,
    literal("$"),
    choice([byte(nameStart), bytes(nameRest, { min: 0 })], [byte("0123456789@*#?$!-_")]),
    ...beforePaint,
    variable,
  ),
];
const quoted = ({ beforePaint = [] }: { beforePaint?: readonly Effect[] } = {}): Arm[] => [
  on("'", literal("'"), ...beforePaint, string, pushState("single")),
  on('"', literal('"'), ...beforePaint, string, pushState("double")),
  on("$", literal("$'"), ...beforePaint, string, pushState("ansi")),
];
const escaped = (beforePaint: readonly Effect[] = []) =>
  on("\\", literal("\\"), character(), ...beforePaint, escape);
const backquote = ({ beforePaint = [], when = [] }: PartOptions = {}) =>
  on(
    "`",
    ...when,
    literal("`"),
    ...beforePaint,
    special,
    openInjection({ static: "bash" }),
    pushState("backquote"),
  );
const parts = ({
  beforePaint = [],
  bareRun = "include",
}: { beforePaint?: readonly Effect[]; bareRun?: "include" | "omit" } = {}): Arm[] => [
  on("$", literal("$(("), ...beforePaint, special, pushState("arithmetic")),
  on("$", literal("$("), ...beforePaint, special, shell.queueEnter(), pushState("subCommand")),
  ...quoted({ beforePaint }),
  ...parameters({ beforePaint }),
  backquote({ beforePaint }),
  escaped(beforePaint),
  on("$\\", byte("$\\"), ...beforePaint, paint("plain")),
  ...(bareRun === "include" ? [on(bareAscii, bytes(bare), ...beforePaint, paint("plain"))] : []),
];
const heredocHeader = (footerIndent: "none" | "tabs") => ({
  style: "label" as const,
  captureFallback: true,
  arms: [
    redispatch(boundary, shell.queueSave({ footerIndent }), popState(), popState()),
    token("$'", "label", shell.captureMark(1), pushState("heredocAnsi")),
    on("$`", shell.group(), paint("label"), shell.captureAppend()),
    token("'", "label", shell.captureMark(1), pushState("heredocSingle")),
    token('"', "label", shell.captureMark(1), pushState("heredocDouble")),
    token("\\\n", "label"),
    on(
      "\\",
      literal("\\"),
      character(),
      paint("label"),
      shell.captureMark(1),
      shell.captureAppend(1),
    ),
    on("\\", literal("\\"), notNext(allBytes), paint("label"), resource()),
  ],
});
const digit = range("0", "9");
const redirects = ["&>>", "<<<", ">>", "<<-", "<<", "<&", ">&", "<>", "&>", ">|", "<", ">"];
const heredocRedirect = [
  on(
    "0123456789<",
    optional(bytes(digit)),
    literal("<<-"),
    paint("operator"),
    pushState("heredocStartStrip"),
  ),
  on(
    "0123456789<",
    optional(bytes(digit)),
    literal("<<"),
    notNext("<"),
    paint("operator"),
    pushState("heredocStart"),
  ),
];
const redirect = on(
  "0123456789<>&",
  optional(bytes(digit)),
  choice(...redirects.map((text) => [literal(text)])),
  paint("operator"),
  pushState("redirect"),
);
const assignment = on(
  nameStart,
  byte(nameStart),
  bytes(nameRest, { min: 0 }),
  optional(literal("+")),
  literal("="),
  variable,
  pushState("assignmentStart"),
);

const arrayAssignment = on(
  nameStart,
  byte(nameStart),
  bytes(nameRest, { min: 0 }),
  optional(literal("+")),
  literal("="),
  lookahead(literal("(")),
  variable,
  pushState("assignmentStart"),
);

function commandStates({ scope }: { scope: "root" | "sub" | "case" }) {
  const command = scope === "root" ? "command" : `${scope}Command`;
  const args = scope === "root" ? "args" : `${scope}Args`;
  const part = scope === "root" ? "word" : `${scope}Word`;
  const closers =
    scope === "sub"
      ? [token(")", "punctuation.special", shell.queueLeave(), popState())]
      : [token(")", "punctuation.bracket", setState(args))];
  const trivia: Arm[] = [
    ...(scope === "case"
      ? [
          on(
            ";",
            choice([literal(";;&")], [literal(";;")], [literal(";&")]),
            paint("operator"),
            popState(),
          ),
        ]
      : []),
    on(" ", bytes(" \t"), paint("plain")),
    on("\t", bytes(" \t"), paint("plain")),
    on(
      "\n",
      literal("\n"),
      shell.queueHas(),
      paint("plain"),
      setState(command),
      pushState("heredocBody"),
      shell.queueOpen(),
    ),
    token("\n", "plain", setState(command)),
    token("\\\n", "string.escape"),
    on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
    on(
      "<>",
      choice([literal("<(")], [literal(">(")]),
      special,
      setState(part),
      shell.queueEnter(),
      pushState("subCommand"),
    ),
    ...heredocRedirect,
    redirect,
    on(
      "|&",
      choice(...["&&", "||", "|&", "|"].map((text) => [literal(text)])),
      paint("operator"),
      setState(command),
      pushState("commandContinuation"),
    ),
    on(
      ";&",
      choice(...[";;&", ";;", ";&", ";", "&"].map((text) => [literal(text)])),
      paint("operator"),
      setState(command),
    ),
    token(
      "(",
      "punctuation.bracket",
      setState(command),
      shell.queueEnter(),
      pushState("subCommand"),
    ),
    ...closers,
  ];
  const classified = classify(
    [
      ...keywordTable(keywords, "keyword", (text) =>
        text === "for" || text === "select"
          ? [pushState("forHeader")]
          : text === "case"
            ? [pushState("caseHeader")]
            : [],
      ),
      ...keywordTable(builtins, "constant.builtin", () => [setState(args)]),
    ],
    [paint("function"), setState(args)],
  );
  return {
    command: {
      style: "plain" as const,
      arms: [
        token("((", "punctuation.special", pushState("arithmeticCommand")),
        ...trivia,
        assignment,
        ...(scope === "case"
          ? [
              on(
                "e",
                literal("esac"),
                notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
                paint("keyword"),
                popState(),
                popState(),
              ),
            ]
          : []),
        on(
          "[",
          literal("[["),
          notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
          paint("keyword"),
          pushState("test"),
        ),
        on(bareAscii, bytes(bare), notNext(continuation), classified),
        on(allBytes, bytes(bare), paint("function"), setState(part)),
        ...parts({ beforePaint: [setState(part)], bareRun: "omit" }),
      ],
    },
    args: {
      style: "plain" as const,
      arms: [
        ...trivia,
        arrayAssignment,
        on(allBytes, bytes(bare), paint("plain"), setState(part)),
        ...parts({ beforePaint: [setState(part)], bareRun: "omit" }),
      ],
    },
    part: {
      style: "plain" as const,
      arms: [redispatch(boundary, setState(args)), ...parts()],
    },
  };
}

const root = commandStates({ scope: "root" });
const nested = commandStates({ scope: "sub" });
const caseBody = commandStates({ scope: "case" });
const arithmeticArms = [
  token("$((", "punctuation.special", pushState("arithmetic")),
  token("$(", "punctuation.special", shell.queueEnter(), pushState("subCommand")),
  backquote(),
  token("))", "punctuation.special", popState()),
  token("(", "punctuation.bracket", pushState("arithmeticGroup")),
  ...parameters(),
  on(nameStart, byte(nameStart), bytes(nameRest, { min: 0 }), variable),
  on(digit, bytes(digit), optional(literal("#"), bytes(union(nameRest, "@"))), paint("number")),
  token(oneOf("!%&*+-/<=>?^|~"), "operator"),
];

export default defineGrammar({
  initial: "command",
  name: "bash",
  aliases: ["sh", "shell", "zsh"],
  queueSweep: { footer: "heredocFooter", footerStyle: "label", tabStyle: "string" },
  states: {
    command: root.command,
    args: root.args,
    word: root.part,
    subCommand: nested.command,
    subArgs: nested.args,
    subWord: nested.part,
    caseCommand: caseBody.command,
    caseArgs: caseBody.args,
    caseWord: caseBody.part,
    commandContinuation: {
      style: "plain",
      arms: [
        on(" \t\n", bytes(" \t\n"), paint("plain")),
        token("\\\n", "string.escape"),
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        redispatch(allBytes, popState()),
      ],
    },
    caseHeader: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        ...parts({ beforePaint: [setState("caseHeaderAfter")] }),
      ],
    },
    caseHeaderAfter: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        on(
          "i",
          literal("in"),
          notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
          paint("keyword"),
          setState("casePatterns"),
        ),
        ...parts(),
      ],
    },
    casePatterns: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        on(
          "e",
          literal("esac"),
          notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
          paint("keyword"),
          popState(),
        ),
        token(")", "punctuation.bracket", pushState("caseCommand")),
        token("|", "operator"),
        ...parts(),
      ],
    },
    test: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        on(
          "]",
          literal("]]"),
          notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
          paint("keyword"),
          popState(),
        ),
        ...quoted(),
        token("$((", "punctuation.special", pushState("arithmetic")),
        token("$(", "punctuation.special", shell.queueEnter(), pushState("subCommand")),
        ...parameters(),
        backquote(),
        escaped(),
        token(oneOf("!<>=|&"), "operator"),
        on(bareAscii, bytes(bare), paint("plain")),
      ],
    },
    forHeader: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        token(oneOf(";\n"), "operator", popState()),
        on(
          nameStart,
          byte(nameStart),
          bytes(nameRest, { min: 0 }),
          variable,
          setState("forBefore"),
        ),
      ],
    },
    forBefore: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        token(oneOf(";\n"), "operator", popState()),
        on(
          "i",
          literal("in"),
          notNext(union(continuation + bareAscii, byteSet({ ranges: [[128, 255]] }))),
          paint("keyword"),
          setState("forAfter"),
        ),
        ...parts({ beforePaint: [setState("forAfter")] }),
      ],
    },
    forAfter: {
      style: "plain",
      arms: [
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        token(oneOf(";\n"), "operator", popState()),
        ...parts(),
      ],
    },
    heredocStart: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        redispatch(boundary, popState()),
        redispatch(allBytes, shell.captureReset(), pushState("heredocHeader")),
      ],
    },
    heredocStartStrip: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        redispatch(boundary, popState()),
        redispatch(allBytes, shell.captureReset(), pushState("heredocHeaderStrip")),
      ],
    },
    heredocHeader: heredocHeader("none"),
    heredocHeaderStrip: heredocHeader("tabs"),
    heredocSingle: {
      style: "label",
      captureFallback: true,
      arms: [token("'", "label", popState())],
    },
    heredocDouble: {
      style: "label",
      captureFallback: true,
      arms: [
        token('"', "label", popState()),
        token("\\\n", "label"),
        on("\\", literal("\\"), byte('$`"\\'), paint("label"), shell.captureAppend(1)),
      ],
    },
    heredocAnsi: {
      style: "label",
      captureFallback: true,
      arms: [
        token("'", "label", popState()),
        on("\\", literal("\\"), character(), paint("label"), shell.captureAppend()),
      ],
    },
    heredocFooter: {
      style: "plain",
      arms: [
        on(
          "\n",
          literal("\n"),
          shell.queueHas(),
          paint("plain"),
          setState("heredocBody"),
          shell.queueOpen(),
        ),
        token("\n", "plain", popState()),
      ],
    },
    heredocBody: {
      style: "string",
      arms: [
        token("\n", "string"),
        on("\\", shell.queueHas(1, 0), literal("\\"), byte("$`\\\n"), escape),
        on("$", shell.queueHas(1, 0), literal("$(("), special, pushState("arithmetic")),
        on(
          "$",
          shell.queueHas(1, 0),
          literal("$("),
          special,
          shell.queueEnter(),
          pushState("subCommand"),
        ),
        ...parameters({ when: [shell.queueHas(1, 0)] }),
        backquote({ when: [shell.queueHas(1, 0)] }),
      ],
    },
    assignmentStart: {
      style: "plain",
      arms: [
        token("\\\n", "string.escape"),
        token("(", "punctuation.bracket", setState("array")),
        redispatch(boundary, popState()),
        ...parts({ beforePaint: [setState("assignment")] }),
      ],
    },
    assignment: { style: "plain", arms: [redispatch(boundary, popState()), ...parts()] },
    array: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        on("#", literal("#"), bytes(notNewline, { min: 0 }), paint("comment")),
        ...parts(),
      ],
    },
    redirect: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        redispatch("\n;|&<>()", popState()),
        ...parts({ beforePaint: [setState("redirectWord")] }),
      ],
    },
    redirectWord: { style: "plain", arms: [redispatch(boundary, popState()), ...parts()] },
    arithmetic: { style: "plain", arms: arithmeticArms },
    arithmeticCommand: { style: "plain", arms: [...quoted(), ...arithmeticArms] },
    arithmeticGroup: {
      style: "plain",
      arms: [
        token("$((", "punctuation.special", pushState("arithmetic")),
        token("$(", "punctuation.special", shell.queueEnter(), pushState("subCommand")),
        backquote(),
        token(")", "punctuation.bracket", popState()),
        token("(", "punctuation.bracket", pushState("arithmeticGroup")),
        ...parameters(),
        on(nameStart, byte(nameStart), bytes(nameRest, { min: 0 }), variable),
        on(
          digit,
          bytes(digit),
          optional(literal("#"), bytes(union(nameRest, "@"))),
          paint("number"),
        ),
        token(oneOf("!%&*+-/<=>?^|~"), "operator"),
      ],
    },
    single: { style: "string", arms: [token("'", "string", popState())] },
    ansi: {
      style: "string",
      arms: [
        token("'", "string", popState()),
        on(
          "\\",
          literal("\\"),
          choice(
            [literal("x"), bytes(union(digit, range("a", "f"), range("A", "F")), { max: 2 })],
            [literal("u"), bytes(union(digit, range("a", "f"), range("A", "F")), { max: 4 })],
            [literal("U"), bytes(union(digit, range("a", "f"), range("A", "F")), { max: 8 })],
            [bytes(range("0", "7"), { max: 3 })],
            [literal("c"), character()],
            [character()],
          ),
          escape,
        ),
      ],
    },
    double: {
      style: "string",
      arms: [
        token('"', "string", popState()),
        on("\\", literal("\\"), byte('$`"\\\n'), escape),
        token("$((", "punctuation.special", pushState("arithmetic")),
        token("$(", "punctuation.special", shell.queueEnter(), pushState("subCommand")),
        ...parameters(),
        backquote(),
      ],
    },
    parameter: {
      style: "variable",
      arms: [
        token("}", "punctuation.special", popState()),
        token("$((", "punctuation.special", pushState("arithmetic")),
        token("$(", "punctuation.special", shell.queueEnter(), pushState("subCommand")),
        ...quoted(),
        ...parameters(),
        backquote(),
        escaped(),
      ],
    },
    backquote: {
      style: "plain",
      arms: [
        on("\\", choice([literal("\\\\")], [literal("\\`")]), hostPrefix(), escape),
        on("`", literal("`"), closeInjection(), special, popState()),
      ],
    },
  },
});
