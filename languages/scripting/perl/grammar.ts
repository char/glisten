import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  shell,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const variable = [
  byte("$@%&"),
  choice(
    [literal("#"), ...ident],
    [...ident, repeat(literal("::"), ...ident)],
    [bytes(digit)],
    [byte("_@!/&`'+-?*$\\.,;:=<>|()[]^~\"")],
  ),
];
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const interpolation: Arm[] = [
  on(
    "$@%",
    byte("$@%"),
    literal("{"),
    paint("punctuation.special"),
    shell.queueEnter(),
    pushState("interpExpr"),
  ),
  on("$@%", ...variable, paint("variable")),
];
const pairs = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
] as const;
const quotes: Record<string, State> = {};
for (const [kind, expanded, twice, regex] of [
  ["q", false, false, false],
  ["qq", true, false, false],
  ["qw", false, false, false],
  ["qr", true, false, true],
  ["m", true, false, true],
  ["s", true, true, true],
  ["tr", false, true, false],
  ["y", false, true, false],
] as const) {
  const prefix = `quote-${kind}`;
  const part = (n: number, bracket: string) => `${prefix}-${n}-${bracket}`;
  const finish = (n: number, bracketed: boolean) =>
    n === 1 && twice
      ? [setState(bracketed ? `${prefix}-second` : part(2, "dynamic"))]
      : [shell.queueLeave(), popState()];
  const delimiters = (n: number): Arm[] => [
    ...pairs.map(([open, close]) =>
      token(open, "string", setState(part(n, open.charCodeAt(0).toString()))),
    ),
    on(
      all,
      character(),
      paint("string"),
      shell.captureReset(),
      shell.captureAppend(),
      shell.queueSave(),
      setState(part(n, "dynamic")),
    ),
  ];
  quotes[`${prefix}-start`] = {
    style: "plain",
    arms: [on(" \t\r\n", bytes(" \t\r\n"), paint("plain")), ...delimiters(1)],
  };
  if (twice)
    quotes[`${prefix}-second`] = {
      style: "plain",
      arms: [on(" \t\r\n", bytes(" \t\r\n"), paint("plain")), ...delimiters(2)],
    };
  for (const n of twice ? [1, 2] : [1]) {
    const isRegex = regex && (kind !== "s" || n === 1);
    const interpolates = expanded;
    const flags = isRegex || (twice && n === 2);
    const common = [escape, ...(interpolates ? interpolation : [])];
    quotes[part(n, "dynamic")] = {
      style: "string",
      arms: [
        on(
          all,
          shell.queueText(),
          ...(flags && !(n === 1 && twice)
            ? [bytes("abcdefghijklmnopqrstuvwxyz", { min: 0 })]
            : []),
          paint("string"),
          ...finish(n, false),
        ),
        ...(isRegex ? [on("$", literal("$"), lookahead(shell.queueText()), paint("string"))] : []),
        ...common,
        ...(isRegex ? [token("[", "string", pushState(`${prefix}-class`))] : []),
      ],
    };
    for (const [open, close] of pairs) {
      const name = part(n, open.charCodeAt(0).toString());
      const nested = `${name}-nested`;
      quotes[name] = {
        style: "string",
        arms: [
          ...(isRegex ? [on("$", literal("$"), lookahead(literal(close)), paint("string"))] : []),
          ...common,
          token(open, "string", pushState(nested)),
          on(
            close,
            literal(close),
            ...(flags && !(n === 1 && twice)
              ? [bytes("abcdefghijklmnopqrstuvwxyz", { min: 0 })]
              : []),
            paint("string"),
            ...finish(n, true),
          ),
        ],
      };
      quotes[nested] = {
        style: "string",
        arms: [
          ...common,
          token(open, "string", pushState(nested)),
          token(close, "string", popState()),
        ],
      };
    }
  }
  if (regex)
    quotes[`${prefix}-class`] = {
      style: "string",
      arms: [escape, ...interpolation, token("]", "string", popState())],
    };
}

const heredocStates: Record<string, State> = {};
const heredocArms: Arm[] = [];
for (const [marker, footerIndent] of [
  ["", "none"],
  ["~", "whitespace"],
] as const) {
  const suffix = marker ? "indented" : "plain";
  heredocArms.push(
    on(
      "<",
      literal(`<<${marker}`),
      lookahead(byte(union(start, "'\"`"))),
      paint("operator"),
      shell.captureReset(),
      setState("value"),
      pushState(`heredoc-${suffix}`),
    ),
  );
  heredocStates[`heredoc-${suffix}`] = {
    style: "label",
    arms: [
      on(
        start,
        ...ident,
        paint("label"),
        shell.captureAppend(),
        shell.queueSave({ footerIndent }),
        popState(),
      ),
      ...(["'", '"', "`"] as const).map((q) =>
        token(
          q,
          "label",
          ...(q === "'" ? [shell.captureMark(1)] : []),
          setState(`heredoc-${suffix}-${q.charCodeAt(0)}`),
        ),
      ),
    ],
  };
  for (const q of ["'", '"', "`"] as const)
    heredocStates[`heredoc-${suffix}-${q.charCodeAt(0)}`] = {
      style: "label",
      captureFallback: true,
      arms: [token(q, "label", shell.queueSave({ footerIndent }), popState())],
    };
}

const groups = [
  ["root", ""],
  ["paren", ")"],
  ["bracket", "]"],
  ["brace", "}"],
  ["interp", "}"],
] as const;
const stateName = (group: string, value: boolean) =>
  group === "root" ? (value ? "value" : "expr") : `${group}${value ? "Value" : "Expr"}`;
const terms =
  "if unless while until for foreach given when return die warn print say printf do eval map grep sort split join keys values each defined exists delete scalar ref bless caller shift pop push unshift splice open close read write chomp chop length substr index rindex uc lc quotemeta require use no my our local state package sub and or xor not eq ne lt gt le ge cmp x isa continue last next redo goto format use constant BEGIN CHECK INIT END UNITCHECK".split(
    " ",
  );
const digits = union(digit, "_");
function code(group: string, value: boolean, closing: string): Arm[] {
  const expr = stateName(group, false),
    after = stateName(group, true);
  return [
    ...(closing
      ? [
          token(
            closing,
            group === "interp" ? "punctuation.special" : "punctuation.bracket",
            ...(group === "interp" ? [shell.queueLeave()] : []),
            popState(),
          ),
        ]
      : []),
    on(
      "\n",
      literal("\n"),
      shell.queueHas(),
      paint("plain"),
      setState(expr),
      pushState("heredocBody"),
      shell.queueOpen(),
    ),
    token("\n", "plain", setState(expr)),
    on(
      "=",
      lineStart(),
      literal("="),
      byte(start),
      bytes(rest, { min: 0 }),
      paint("comment"),
      pushState("pod"),
    ),
    ...["__END__", "__DATA__"].map((x) =>
      on("_", lineStart(), literal(x), notNext(rest), paint("comment"), setState("data")),
    ),
    token("#", "comment", pushState("lineComment")),
    ...heredocArms.map((arm) => ({
      ...arm,
      then: arm.then.map((e) => (e.kind === "goto" && e.state === "value" ? setState(after) : e)),
    })),
    ...(!value
      ? ["qq", "qw", "qr", "tr", "q", "m", "s", "y"].map((kind) =>
          on(
            kind[0]!,
            literal(kind),
            notNext(union("_", range("a", "z"), range("A", "Z"), digit)),
            paint("string"),
            setState(after),
            shell.queueEnter(),
            pushState(`quote-${kind}-start`),
          ),
        )
      : []),
    token("'", "string", setState(after), pushState("single")),
    token('"', "string", setState(after), pushState("double")),
    token("`", "string", setState(after), pushState("doubleBacktick")),
    on("$@%&", byte("$@%&"), lookahead(byte("{[")), paint("variable"), setState(after)),
    on("$@%&", ...variable, paint("variable"), setState(after)),
    on(
      "v",
      literal("v"),
      byte(digit),
      bytes(digits, { min: 0 }),
      literal("."),
      byte(digit),
      bytes(digits, { min: 0 }),
      repeat(literal("."), byte(digit), bytes(digits, { min: 0 })),
      paint("number"),
      setState(after),
    ),
    on(
      digit,
      choice(
        [literal("0"), byte("xX"), bytes(union(digit, range("a", "f"), range("A", "F"), "_"))],
        [literal("0"), byte("bB"), bytes("01_")],
        [literal("0"), byte("oO"), bytes("01234567_")],
        [
          bytes(digits),
          optional(literal("."), byte(digit), bytes(digits, { min: 0 })),
          optional(byte("eE"), optional(byte("+-")), byte(digit), bytes(digits, { min: 0 })),
        ],
      ),
      paint("number"),
      setState(after),
    ),
    on(
      start,
      ...ident,
      lookahead(bytes(" \t", { min: 0 }), literal("=>")),
      paint("string"),
      setState(after),
    ),
    on(
      start,
      ...ident,
      classify(
        [
          ...[...new Set(terms)].map((text) => ({
            text,
            then: [
              paint("keyword"),
              ...(text === "sub"
                ? [setState(expr), pushState("subName")]
                : text === "package" || text === "use" || text === "no" || text === "require"
                  ? [setState(expr), pushState("moduleName")]
                  : [setState(expr)]),
            ],
          })),
        ],
        [paint("variable"), setState(after)],
      ),
    ),
    ...(!value ? [token("/", "string", setState(after), pushState("regex"))] : []),
    ...(!value
      ? [
          on(
            "<",
            literal("<"),
            choice([...ident], [literal("$"), ...ident]),
            literal(">"),
            paint("string"),
            setState(after),
          ),
        ]
      : []),
    token("(", "punctuation.bracket", setState(after), pushState("parenExpr")),
    token("[", "punctuation.bracket", setState(after), pushState("bracketExpr")),
    token("{", "punctuation.bracket", setState(after), pushState("braceExpr")),
    token("->", "operator", setState(after), pushState("member")),
    ...[
      "=~",
      "!~",
      "=>",
      "::",
      "==",
      "!=",
      "<=",
      ">=",
      "<=>",
      "**",
      "&&",
      "||",
      "//",
      "<<",
      ">>",
      "...",
      "..",
      "+=",
      "-=",
      "*=",
      "/=",
      "//=",
    ].map((op) => token(op, "operator", setState(expr))),
    on("+-*/%=!<>&|^~?:.", byte("+-*/%=!<>&|^~?:."), paint("operator"), setState(expr)),
    on(",;", byte(",;"), paint("punctuation.delimiter"), setState(expr)),
  ];
}
const states: Record<string, State> = { ...quotes, ...heredocStates };
for (const [group, close] of groups)
  for (const value of [false, true])
    states[stateName(group, value)] = { style: "plain", arms: code(group, value, close) };
Object.assign(states, {
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  pod: {
    style: "comment",
    arms: [on("=", lineStart(), literal("=cut"), notNext(rest), paint("comment"), popState())],
  },
  data: { style: "comment", arms: [] },
  single: { style: "string", arms: [escape, token("'", "string", popState())] },
  double: { style: "string", arms: [escape, ...interpolation, token('"', "string", popState())] },
  doubleBacktick: {
    style: "string",
    arms: [escape, ...interpolation, token("`", "string", popState())],
  },
  regex: {
    style: "string",
    arms: [
      on("$", literal("$"), lookahead(literal("/")), paint("string")),
      escape,
      ...interpolation,
      token("[", "string", pushState("regexClass")),
      on(
        "/",
        literal("/"),
        bytes("abcdefghijklmnopqrstuvwxyz", { min: 0 }),
        paint("string"),
        popState(),
      ),
    ],
  },
  regexClass: {
    style: "string",
    arms: [escape, ...interpolation, token("]", "string", popState())],
  },
  member: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(start, ...ident, paint("function"), popState()),
    ],
    otherwise: [popState()],
  },
  subName: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      on(start, ...ident, repeat(literal("::"), ...ident), paint("function"), popState()),
    ],
    otherwise: [popState()],
  },
  moduleName: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      on(
        "v",
        literal("v"),
        byte(digit),
        bytes(digits, { min: 0 }),
        literal("."),
        byte(digit),
        bytes(digits, { min: 0 }),
        repeat(literal("."), byte(digit), bytes(digits, { min: 0 })),
        paint("number"),
        popState(),
      ),
      on(start, ...ident, repeat(literal("::"), ...ident), paint("type"), popState()),
    ],
    otherwise: [popState()],
  },
  heredocBody: {
    style: "string",
    arms: [
      on("\\", shell.queueHas(1, 0), literal("\\"), character(), paint("string.escape")),
      ...interpolation.map((arm) => ({ ...arm, match: [shell.queueHas(1, 0), ...arm.match] })),
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
});
export default defineGrammar({
  name: "perl",
  aliases: ["pm", "perl5"],
  initial: "expr",
  queueSweep: { footer: "heredocFooter", footerStyle: "label", tabStyle: "string" },
  states,
});
