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
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
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

export function ruby(crystal: boolean) {
  const all = byteSet({ ranges: [[0, 255]] });
  const digit = range("0", "9");
  const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
  const rest = union(start, digit);
  const ident = [byte(start), bytes(rest, { min: 0 })];
  const space = bytes(" \t", { min: 0 });
  const keywords = (
    crystal
      ? "abstract alias annotation as as? asm begin break case class def do else elsif end ensure enum extend for fun if ifdef in include lib macro module next of out private protected require rescue return select struct then type undef union unless until when while with yield"
      : "alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return then undef unless until when while yield"
  ).split(" ");
  const values = crystal
    ? ["true", "false", "nil", "self", "super", "__FILE__", "__LINE__", "__DIR__", "__END_LINE__"]
    : ["true", "false", "nil", "self", "super", "__FILE__", "__LINE__", "__ENCODING__"];
  const builtins = (
    crystal
      ? "puts print p pp raise sizeof instance_sizeof pointerof offsetof typeof uninitialized is_a? responds_to? getter setter property getter? property? record delegate forward_missing_to"
      : "puts print p warn require require_relative load raise fail attr_reader attr_writer attr_accessor include extend prepend private protected public module_function block_given? proc lambda loop sleep exit abort sprintf format binding eval"
  ).split(" ");
  const digits = (set: typeof digit) => [byte(set), repeat(bytes("_", { min: 0 }), byte(set))];
  const hex = union(digit, range("a", "f"), range("A", "F"));
  const crystalCharEscape = [
    literal("\\"),
    choice(
      [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
      [literal("u"), bytes(hex, { min: 4, max: 4 })],
      [literal("x"), bytes(hex, { min: 2, max: 2 })],
      [character()],
    ),
  ];
  const variable = [
    choice(
      [literal("@@"), ...ident],
      [literal("@"), ...ident],
      [literal("$"), choice([bytes(digit)], [...ident], [byte("~*$?!@/\\;,.=:<>\"&`'+-0")])],
    ),
  ];
  const interpolation = [
    token("#{", "punctuation.special", shell.queueEnter(), pushState("interpExpr")),
    on("#", literal("#"), ...variable, paint("variable")),
  ];
  const macroInterpolation = crystal
    ? [
        token("{{", "punctuation.special", shell.queueEnter(), pushState("macroOutputExpr")),
        token("{%", "punctuation.special", shell.queueEnter(), pushState("macroTagExpr")),
      ]
    : [];
  const escape = on("\\", literal("\\"), character(), paint("string.escape"));
  const delimiters = [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
  const percentStates: Record<string, State> = {};
  const percentArms: Arm[] = [];
  for (const opener of delimiters) {
    const closer = pairs[opener] ?? opener;
    for (const [prefixes, interpolates, regex] of [
      ["qwis", false, false],
      ["QWIx", true, false],
      ["r", true, true],
      ["", true, false],
    ] as const) {
      const state = `percent-${opener.charCodeAt(0)}-${regex ? "regex" : interpolates ? "expanded" : "literal"}`;
      const nested = `${state}-nested`;
      percentArms.push(
        on(
          "%",
          literal("%"),
          ...(prefixes ? [byte(prefixes)] : []),
          literal(opener),
          paint("string"),
          setState("value"),
          pushState(state),
        ),
      );
      const common = [
        ...(opener === "\\" ? [] : [escape]),
        ...(interpolates ? interpolation : []),
        ...macroInterpolation,
        ...(closer !== opener ? [token(opener, "string", pushState(nested))] : []),
      ];
      percentStates[state] = {
        style: "string",
        arms: [
          ...common,
          ...(regex
            ? [
                on(
                  closer,
                  literal(closer),
                  bytes("imxounes", { min: 0 }),
                  paint("string"),
                  popState(),
                ),
              ]
            : [token(closer, "string", popState())]),
        ],
      };
      if (closer !== opener)
        percentStates[nested] = {
          style: "string",
          arms: [...common, token(closer, "string", popState())],
        };
    }
  }
  const heredocPolicies = [
    ["", "none"],
    ["-", "whitespace"],
    ["~", "whitespace"],
  ] as const;
  const heredocStates: Record<string, State> = {};
  const heredocArms: Arm[] = [];
  for (const [marker, footerIndent] of heredocPolicies) {
    const suffix = marker === "" ? "plain" : marker === "-" ? "dash" : "tilde";
    const name = `heredocStart-${suffix}`;
    heredocArms.push(
      on(
        "<",
        literal(`<<${marker}`),
        lookahead(byte(union(start, "'\"`"))),
        paint("operator"),
        shell.captureReset(),
        setState("value"),
        pushState(name),
      ),
    );
    heredocStates[name] = {
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
        ...(["'", '"', "`"] as const).map((quote) =>
          token(
            quote,
            "label",
            ...(quote === "'" ? [shell.captureMark(1)] : []),
            setState(`heredocQuote-${suffix}-${quote.charCodeAt(0)}`),
          ),
        ),
      ],
    };
    for (const quote of ["'", '"', "`"] as const)
      heredocStates[`heredocQuote-${suffix}-${quote.charCodeAt(0)}`] = {
        style: "label",
        captureFallback: true,
        arms: [token(quote, "label", shell.queueSave({ footerIndent }), popState())],
      };
  }

  const groups = [
    ["root", "", ""],
    ["paren", "(", ")"],
    ["bracket", "[", "]"],
    ["brace", "{", "}"],
    ["interp", "", "}"],
    ...(crystal
      ? ([
          ["macroOutput", "", "}}"],
          ["macroTag", "", "%}"],
          ["annotation", "", "]"],
        ] as const)
      : []),
  ] as const;
  const stateName = (group: string, value: boolean) =>
    group === "root" ? (value ? "value" : "expr") : `${group}${value ? "Value" : "Expr"}`;
  function code(group: string, value: boolean, closing: string): Arm[] {
    const expr = stateName(group, false),
      after = stateName(group, true);
    return [
      ...(closing
        ? [
            token(
              closing,
              group === "interp" ||
                group === "macroOutput" ||
                group === "macroTag" ||
                group === "annotation"
                ? "punctuation.special"
                : "punctuation.bracket",
              ...(group === "interp" || group === "macroOutput" || group === "macroTag"
                ? [shell.queueLeave()]
                : []),
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
        literal("=begin"),
        notNext(rest),
        paint("comment"),
        pushState("blockComment"),
      ),
      on("_", lineStart(), literal("__END__"), notNext(rest), paint("comment"), setState("data")),
      token("#", "comment", pushState("lineComment")),
      ...(crystal
        ? [
            token(
              "{{",
              "punctuation.special",
              shell.queueEnter(),
              setState(after),
              pushState("macroOutputExpr"),
            ),
            token(
              "{%",
              "punctuation.special",
              shell.queueEnter(),
              setState(after),
              pushState("macroTagExpr"),
            ),
            token("@[", "punctuation.special", setState(after), pushState("annotationName")),
          ]
        : []),
      ...heredocArms.map((arm) => ({
        ...arm,
        then: arm.then.map((effect) =>
          effect.kind === "goto" && effect.state === "value" ? setState(after) : effect,
        ),
      })),
      ...percentArms.map((arm) => ({
        ...arm,
        then: arm.then.map((effect) =>
          effect.kind === "goto" && effect.state === "value" ? setState(after) : effect,
        ),
      })),
      ...(crystal
        ? [
            on(
              "'",
              literal("'"),
              lookahead(choice(crystalCharEscape, [character()]), literal("'")),
              paint("string"),
              setState(after),
              pushState("character"),
            ),
          ]
        : [token("'", "string", setState(after), pushState("single"))]),
      token('"', "string", setState(after), pushState("double")),
      token("`", "string", setState(after), pushState("doubleBacktick")),
      on(
        "@",
        choice([literal("@@"), ...ident], [literal("@"), ...ident]),
        paint("variable.member"),
        setState(after),
      ),
      on("$", ...variable, paint("variable"), setState(after)),
      on(
        ":",
        literal(":"),
        byte(start),
        bytes(rest, { min: 0 }),
        optional(byte("?!=")),
        paint("string"),
        setState(after),
      ),
      on(":", literal(":"), literal('"'), paint("string"), setState(after), pushState("double")),
      on(":", literal(":"), literal("'"), paint("string"), setState(after), pushState("single")),
      ...(crystal
        ? [
            on(
              start,
              ...ident,
              lookahead(literal(":"), notNext(":")),
              paint("property"),
              setState(expr),
            ),
          ]
        : [on(start, ...ident, literal(":"), notNext(":"), paint("string"), setState(expr))]),
      ...(!crystal
        ? [
            on(
              "?",
              literal("?"),
              ...(value ? [previousNotIn(except(all, " \t"))] : []),
              notNext(" \t\r\n"),
              choice([literal("\\"), character()], [character()]),
              paint("string"),
              setState(after),
            ),
          ]
        : []),
      on(
        "0123456789",
        choice(
          [literal("0"), byte("xX"), ...digits(hex)],
          [literal("0"), byte("bB"), ...digits("01")],
          [literal("0"), byte("oO"), ...digits("01234567")],
          [
            ...digits(digit),
            optional(literal("."), ...digits(digit)),
            optional(byte("eE"), optional(byte("+-")), ...digits(digit)),
          ],
        ),
        ...(crystal
          ? [
              optional(
                optional(literal("_")),
                choice(
                  ...[
                    "i8",
                    "i16",
                    "i32",
                    "i64",
                    "i128",
                    "u8",
                    "u16",
                    "u32",
                    "u64",
                    "u128",
                    "f32",
                    "f64",
                  ].map((s) => [literal(s)]),
                ),
              ),
            ]
          : [optional(literal("r")), optional(literal("i"))]),
        notNext(rest),
        paint("number"),
        setState(after),
      ),
      on(
        "d",
        literal("def"),
        notNext(rest),
        paint("keyword"),
        setState(expr),
        pushState("defName"),
      ),
      ...(crystal ? [on(range("A", "Z"), ...ident, paint("type"), setState(after))] : []),
      on(
        start,
        ...ident,
        optional(byte("?!")),
        lookahead(space, literal("(")),
        classify(
          [
            ...keywordTable(keywords, "keyword", () => [setState(expr)]),
            ...keywordTable(values, "constant.builtin", () => [setState(after)]),
          ],
          [paint("function"), setState(after)],
        ),
      ),
      on(
        range("A", "Z"),
        byte(range("A", "Z")),
        bytes(union(range("A", "Z"), digit, "_"), { min: 0 }),
        notNext(rest),
        paint("constant.builtin"),
        setState(after),
      ),
      on(range("A", "Z"), ...ident, paint("type"), setState(after)),
      on(
        start,
        ...ident,
        optional(byte("?!")),
        classify(
          [
            ...keywordTable(keywords, "keyword", () => [setState(expr)]),
            ...keywordTable(values, "constant.builtin", () => [setState(after)]),
            ...keywordTable(builtins, "function", () => [setState(after)]),
          ],
          [paint("variable"), setState(after)],
        ),
      ),
      ...(crystal && value
        ? [token("//=", "operator", setState(expr)), token("//", "operator", setState(expr))]
        : []),
      ...(!value
        ? [token("/", "string", setState(after), pushState("regex"))]
        : [
            on(
              "/",
              previousNotIn(except(all, " \t")),
              literal("/"),
              notNext(" \t\r\n="),
              paint("string"),
              setState(after),
              pushState("regex"),
            ),
          ]),
      token("(", "punctuation.bracket", setState(after), pushState("parenExpr")),
      token("[", "punctuation.bracket", setState(after), pushState("bracketExpr")),
      token("{", "punctuation.bracket", setState(after), pushState("braceExpr")),
      token("&.", "operator", setState(after), pushState("member")),
      ...[
        "::",
        "->",
        "=>",
        "===",
        "==",
        "!=",
        "<=",
        ">=",
        "**",
        "&&",
        "||",
        "<<",
        ">>",
        "...",
        "..",
        "+=",
        "-=",
        "*=",
        "/=",
      ].map((op) => token(op, "operator", setState(expr))),
      token(".", "punctuation.delimiter", setState(after), pushState("member")),
      ...(crystal ? [token(":", "punctuation.delimiter", setState(expr))] : []),
      on("+-*/%=!<>&|^~?:", byte("+-*/%=!<>&|^~?:"), paint("operator"), setState(expr)),
      on(",;", byte(",;"), paint("punctuation.delimiter"), setState(expr)),
    ];
  }
  const states: Record<string, State> = { ...percentStates, ...heredocStates };
  for (const [group, , close] of groups)
    for (const value of [false, true])
      states[stateName(group, value)] = { style: "plain", arms: code(group, value, close) };
  Object.assign(states, {
    ...(crystal
      ? {
          character: {
            style: "string",
            arms: [
              on("\\", ...crystalCharEscape, paint("string.escape")),
              token("'", "string", popState()),
            ],
          },
          annotationName: {
            style: "plain",
            arms: [on(start, ...ident, paint("attribute"), setState("annotationExpr"))],
            otherwise: [setState("annotationExpr")],
          },
        }
      : {}),
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [on("=", lineStart(), literal("=end"), notNext(rest), paint("comment"), popState())],
    },
    data: { style: "comment", arms: [] },
    single: { style: "string", arms: [escape, token("'", "string", popState())] },
    double: {
      style: "string",
      arms: [escape, ...interpolation, ...macroInterpolation, token('"', "string", popState())],
    },
    doubleBacktick: {
      style: "string",
      arms: [escape, ...interpolation, ...macroInterpolation, token("`", "string", popState())],
    },
    regex: {
      style: "string",
      arms: [
        escape,
        ...interpolation,
        token("[", "string", pushState("regexClass")),
        on("/", literal("/"), bytes("imxounes", { min: 0 }), paint("string"), popState()),
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
        on(start, ...ident, optional(byte("?!")), paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    defName: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("self.", "variable"),
        on(start, ...ident, literal("."), paint("type")),
        on(start, ...ident, optional(byte("?!=")), paint("function"), popState()),
        on(
          "[]+-*/%<>=!~&|^`",
          choice(
            ...[
              "[]=",
              "[]",
              "<=>",
              "===",
              "==",
              "=~",
              "!~",
              "<=",
              ">=",
              "<<",
              ">>",
              "**",
              "+@",
              "-@",
            ].map((s) => [literal(s)]),
            [byte("+-*/%<>=!~&|^`")],
          ),
          paint("function"),
          popState(),
        ),
      ],
      otherwise: [popState()],
    },
    heredocBody: {
      style: "string",
      arms: [
        ...macroInterpolation,
        on("\\", shell.queueHas(1, 0), literal("\\"), character(), paint("string.escape")),
        on(
          "#",
          shell.queueHas(1, 0),
          literal("#{"),
          paint("punctuation.special"),
          shell.queueEnter(),
          pushState("interpExpr"),
        ),
        on("#", shell.queueHas(1, 0), literal("#"), ...variable, paint("variable")),
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
  return defineGrammar({
    name: crystal ? "crystal" : "ruby",
    aliases: crystal ? [] : ["rb"],
    initial: "expr",
    queueSweep: { footer: "heredocFooter", footerStyle: "label", tabStyle: "string" },
    states,
  });
}
