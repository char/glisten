import {
  bytes,
  bytesOf,
  byteSet,
  character,
  choice,
  classify,
  counterDecrement,
  counterIncrement,
  counterPositive,
  counterReset,
  counterZero,
  defineGrammar,
  except,
  keywordTable,
  literal,
  notNext,
  on,
  paint,
  popState,
  pushState,
  redispatch,
  repeat,
  setState,
  slot,
  token,
  union,
  range,
  type Arm,
  type Effect,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const braces = slot.counter("body-braces", { scope: "frame" });
// A zero-depth brace closes a body, but not a top-level quote or substitution.
const inBody = slot.counter("in-body", { scope: "frame" });
const space = " \t\v\f\r";
const digit = range("0", "9");
const varChar = union(digit, range("a", "z"), range("A", "Z"), "_");
const variableName = choice([bytes(varChar)], [literal("::")]);
const variableRest = repeat(choice([bytes(varChar)], [literal("::"), bytes(":", { min: 0 })]));
const separators = " \t\v\f\r\n;[]$\\";
const bare = except(all, separators);
const commandName = except(bare, '"{#');
const keywords =
  `append break catch continue default dict error eval finally foreach global if lappend lassign lindex linsert list llength lmap lrange lrepeat lreplace lreverse lsearch lset lsort namespace on package proc return set throw trap try unset variable while`.split(
    /\s+/,
  );
const direct = new Set(["proc", "if", "while", "for", "catch", "eval", "namespace"]);
const scriptCases = [
  { text: "proc", target: "procName" },
  { text: "if", target: "ifTest" },
  { text: "while", target: "whileTest" },
  { text: "for", target: "forInit" },
  { text: "catch", target: "catchBody" },
  { text: "eval", target: "evalBody" },
  { text: "namespace", target: "namespaceSub" },
];
const escape = [
  on(
    "\\",
    literal("\\"),
    choice([literal("\r\n")], [literal("\n")]),
    bytes(" \t", { min: 0 }),
    paint("string.escape"),
  ),
  on("\\", literal("\\"), character(), paint("string.escape")),
];
const substitutions = (next?: string) => [
  token("[", "punctuation.bracket", ...(next ? [setState(next)] : []), pushState("bracketStart")),
  token("${", "variable", ...(next ? [setState(next)] : []), pushState("variableBraced")),
  on(
    "$",
    literal("$"),
    choice([variableName, variableRest], [literal("")]),
    literal("("),
    paint("variable"),
    ...(next ? [setState(next)] : []),
    pushState("arrayIndex"),
  ),
  on(
    "$",
    literal("$"),
    variableName,
    variableRest,
    paint("variable"),
    ...(next ? [setState(next)] : []),
  ),
  escape[0]!,
  on("\\", literal("\\"), character(), paint("string.escape"), ...(next ? [setState(next)] : [])),
];
const states: Record<string, State> = {
  braced: {
    style: "string",
    arms: [
      on(
        "\\",
        literal("\\"),
        choice([literal("\r\n")], [literal("\n")]),
        bytes(" \t", { min: 0 }),
        paint("string.escape"),
      ),
      on("\\", literal("\\"), character(), paint("string")),
      token("{", "punctuation.bracket", pushState("braced")),
      token("}", "punctuation.bracket", popState()),
    ],
  },
  quoted: { style: "string", arms: [token('"', "string", popState()), ...substitutions()] },
  params: {
    style: "variable",
    arms: [
      on(space + "\n", bytes(space + "\n"), paint("plain")),
      token("{", "punctuation.bracket", pushState("paramGroup")),
      token("}", "punctuation.bracket", popState()),
      on("\\", literal("\\"), character(), paint("variable")),
    ],
  },
  paramGroup: {
    style: "variable",
    arms: [
      on(space + "\n", bytes(space + "\n"), paint("plain"), setState("paramDefault")),
      token("}", "punctuation.bracket", popState()),
      on("\\", literal("\\"), character(), paint("variable")),
    ],
  },
  paramDefault: {
    style: "string",
    arms: [
      token("{", "punctuation.bracket", pushState("braced")),
      token("}", "punctuation.bracket", popState()),
      on("\\", literal("\\"), character(), paint("string")),
    ],
  },
  variableBraced: { style: "variable", arms: [token("}", "variable", popState())] },
  arrayIndex: { style: "variable", arms: [token(")", "variable", popState()), ...substitutions()] },
  comment: {
    style: "comment",
    arms: [
      on(
        "\\",
        literal("\\"),
        choice([literal("\r\n")], [literal("\n")]),
        bytes(" \t", { min: 0 }),
        paint("comment"),
      ),
      redispatch("\n", popState()),
    ],
  },
};

type Context = "root" | "bracket" | "body";
for (const context of ["root", "bracket", "body"] as const) {
  const startState = `${context}Start`;
  const argsState = `${context}Args`;
  const wordState = `${context}Word`;
  const ending: Arm[] =
    context === "root"
      ? []
      : [token(context === "bracket" ? "]" : "}", "punctuation.bracket", popState())];
  const wordEnd =
    context === "bracket" ? " \t\v\f\r\n;]" : context === "body" ? " \t\v\f\r\n;}" : " \t\v\f\r\n;";
  const wordFor = (next: string): string => {
    if (next === wordState) return wordState;
    const state = `${next}Continuation`;
    if (!states[state])
      states[state] = {
        style: "plain",
        arms: [
          ...ending,
          redispatch(wordEnd, setState(next)),
          on(
            "\\",
            literal("\\"),
            choice([literal("\r\n")], [literal("\n")]),
            bytes(" \t", { min: 0 }),
            paint("string.escape"),
            setState(next),
          ),
          ...substitutions(),
          on(
            except(all, union(wordEnd, "[$\\")),
            bytes(except(all, union(wordEnd, "[$\\"))),
            paint("plain"),
          ),
        ],
      };
    return state;
  };
  const commandChunk = except(all, union(wordEnd, "[$\\"));
  const commandLead = except(commandChunk, '"{#');
  const tail = (next: string) => [
    on("{", literal("{*}"), notNext(" \t\v\f\r\n"), paint("operator")),
    token("{", "punctuation.bracket", setState(next), pushState("braced")),
    token('"', "string", setState(next), pushState("quoted")),
    ...substitutions(wordFor(next)),
  ];
  const argument = (next: string, body = false): Arm[] => [
    ...ending,
    on(space, bytes(space), paint("plain")),
    token("\n", "plain", setState(startState)),
    token(";", "punctuation.delimiter", setState(startState)),
    ...(body
      ? [
          on("{", literal("{*}"), notNext(" \t\v\f\r\n"), paint("operator")),
          token("{", "punctuation.bracket", setState(next), pushState("bodyStart")),
        ]
      : []),
    ...tail(next),
    token("$", "plain", setState(wordFor(next))),
    on(
      except(all, wordEnd),
      bytes(except(all, union(wordEnd, "[$\\"))),
      paint("plain"),
      setState(wordFor(next)),
    ),
  ];
  const cases = [
    ...scriptCases.map(({ text, target }) => ({
      text,
      then: [paint(text === "for" ? "function" : "keyword"), setState(`${context}${target}`)],
    })),
    ...keywordTable(
      keywords.filter((word) => !direct.has(word)),
      "keyword",
    ).map(({ text, then }) => ({ text, then: [...then, setState(argsState)] })),
  ];
  states[startState] = {
    style: "plain",
    arms: [
      ...ending,
      on(space, bytes(space), paint("plain")),
      token("\n", "plain"),
      token(";", "punctuation.delimiter"),
      token("#", "comment", pushState("comment")),
      on("{", literal("{*}"), notNext(" \t\v\f\r\n"), paint("operator")),
      token("{", "punctuation.bracket", setState(argsState), pushState("braced")),
      token('"', "string", setState(argsState), pushState("quoted")),
      ...substitutions(wordState),
      token("$", "function", setState(wordState)),
      on(
        commandLead,
        bytes(commandChunk),
        notNext("[$\\"),
        classify(cases, [paint("function"), setState(argsState)]),
      ),
      on(commandChunk, bytes(commandChunk), paint("function"), setState(wordState)),
    ],
  };
  states[argsState] = { style: "plain", arms: argument(wordState) };
  states[wordState] = {
    style: "plain",
    arms: [
      ...ending,
      redispatch(wordEnd, setState(argsState)),
      on(
        "\\",
        literal("\\"),
        choice([literal("\r\n")], [literal("\n")]),
        bytes(" \t", { min: 0 }),
        paint("string.escape"),
        setState(argsState),
      ),
      ...substitutions(),
      on(
        except(all, union(wordEnd, "[$\\")),
        bytes(except(all, union(wordEnd, "[$\\"))),
        paint("plain"),
      ),
    ],
  };
  const transitions: [string, string, boolean][] = [
    ["procName", "procArgs", false],
    ["procArgs", "procBody", false],
    ["procBody", "Args", true],
    ["whileTest", "whileBody", false],
    ["whileBody", "Args", true],
    ["forInit", "forTest", true],
    ["forTest", "forNext", false],
    ["forNext", "forBody", true],
    ["forBody", "Args", true],
    ["catchBody", "Args", true],
    ["evalBody", "Args", true],
    ["ifBody", "ifTail", true],
    ["elseBody", "Args", true],
    ["namespaceName", "namespaceBody", false],
    ["namespaceBody", "Args", true],
  ];
  for (const [state, next, body] of transitions) {
    const nextState = `${context}${next}`;
    const prefix =
      state === "procName"
        ? [on(commandName, bytes(commandName), paint("variable"), setState(wordFor(nextState)))]
        : [];
    states[`${context}${state}`] = {
      style: "plain",
      arms: [
        ...prefix,
        ...(state === "procArgs"
          ? [
              on("{", literal("{*}"), notNext(" \t\v\f\r\n"), paint("operator")),
              token("{", "punctuation.bracket", setState(nextState), pushState("params")),
            ]
          : []),
        ...argument(nextState, body),
      ],
    };
  }
  states[`${context}ifTest`] = { style: "plain", arms: argument(`${context}ifAfterTest`) };
  states[`${context}ifAfterTest`] = {
    style: "plain",
    arms: [
      on(
        "t",
        literal("then"),
        notNext(except(all, wordEnd)),
        paint("keyword"),
        setState(`${context}ifBody`),
      ),
      ...argument(`${context}ifTail`, true),
    ],
  };
  states[`${context}ifTail`] = {
    style: "plain",
    arms: [
      on(
        "e",
        literal("elseif"),
        notNext(except(all, wordEnd)),
        paint("keyword"),
        setState(`${context}ifTest`),
      ),
      on(
        "e",
        literal("else"),
        notNext(except(all, wordEnd)),
        paint("keyword"),
        setState(`${context}elseBody`),
      ),
      ...argument(wordState),
    ],
  };
  states[`${context}namespaceSub`] = {
    style: "plain",
    arms: [
      on(
        "e",
        literal("eval"),
        notNext(except(all, wordEnd)),
        paint("keyword"),
        setState(`${context}namespaceName`),
      ),
      ...argument(wordState),
    ],
  };
}
const sharedNames = Object.keys(states).filter(
  (name) =>
    name.startsWith("bracket") ||
    ["quoted", "comment", "arrayIndex", "variableBraced"].includes(name),
);

const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

function bodyEffects(effects: readonly Effect[]): Effect[] {
  return effects.flatMap((effect): Effect[] => {
    if (effect.kind === "word") {
      const cases = effect.cases.map((item) => {
        const then = bodyEffects(item.then);
        return sameItems(then, item.then) ? item : { ...item, then };
      });
      const otherwise = bodyEffects(effect.otherwise);
      return sameItems(cases, effect.cases) && sameItems(otherwise, effect.otherwise)
        ? [effect]
        : [{ ...effect, cases, otherwise }];
    }
    return effect.kind === "push" && effect.state === "variableBraced"
      ? [counterIncrement(braces), effect]
      : [effect];
  });
}

function bodyState(
  state: State,
  shared: boolean,
  variable = false,
  extra: readonly Arm[] = [],
): State {
  const transform = (arm: Arm): Arm => {
    const first = arm.match[0];
    const closing =
      first?.kind === "literal" &&
      first.text === "}" &&
      arm.then.some((effect) => effect.kind === "pop");
    return {
      ...arm,
      match: [
        ...(!shared && closing ? [counterZero(braces)] : []),
        ...arm.match.map((matcher, index) =>
          index === 0 &&
          matcher.kind === "run" &&
          bytesOf(matcher.set).some((byte) => byte === 123 || byte === 125)
            ? { ...matcher, set: except(matcher.set, "{}") }
            : matcher.kind === "notNext" && matcher.set === "[$\\"
              ? { ...matcher, set: union(matcher.set, "{}") }
              : matcher,
        ),
      ],
      then: [
        ...(shared && variable && closing ? [counterDecrement(braces)] : []),
        ...bodyEffects(arm.then),
      ],
    };
  };
  const arms = state.arms.flatMap((arm) => {
    const transformed = transform(arm);
    if (!shared) return [transformed];
    if (sameItems(arm.match, transformed.match) && sameItems(arm.then, transformed.then))
      return [arm];
    return [
      { ...arm, match: [counterZero(inBody), ...arm.match] },
      { ...transformed, match: [counterPositive(inBody), ...transformed.match] },
    ];
  });
  return {
    ...state,
    ...(shared ? { slots: "shared" as const } : {}),
    arms: [
      ...(shared
        ? [redispatch("}", counterPositive(inBody), counterZero(braces), popState())]
        : []),
      ...arms,
      ...extra.map((arm) => ({
        ...transform(arm),
        match: [counterPositive(inBody), ...arm.match],
      })),
      on(
        "{",
        ...(shared ? [counterPositive(inBody)] : []),
        literal("{"),
        paint(state.style),
        counterIncrement(braces),
      ),
      on(
        "}",
        ...(shared ? [counterPositive(inBody)] : []),
        counterPositive(braces),
        literal("}"),
        paint(state.style),
        counterDecrement(braces),
      ),
    ],
  };
}

for (const name of sharedNames) {
  const state = states[name]!;
  const extra =
    name === "comment" || name === "variableBraced"
      ? [on("\\", literal("\\"), character(), paint(state.style))]
      : [];
  states[name] = bodyState(state, true, name === "variableBraced", extra);
}
for (const name of Object.keys(states).filter((name) => name.startsWith("body")))
  states[name] = bodyState(states[name]!, false);
for (const [name, state] of Object.entries(states))
  states[name] = {
    ...state,
    arms: state.arms.map((arm) => ({
      ...arm,
      then: arm.then.flatMap((effect) =>
        effect.kind === "push" && effect.state === "bodyStart"
          ? [effect, counterReset(braces), counterReset(inBody), counterIncrement(inBody)]
          : [effect],
      ),
    })),
  };

export default defineGrammar({
  name: "tcl",
  aliases: ["sdc", "xdc"],
  initial: "rootStart",
  states,
});
