import {
  type Arm,
  type Effect,
  type State,
  byte,
  byteSet,
  bytes,
  character,
  choice,
  closeInjection,
  except,
  hostPrefix,
  literal,
  lookahead,
  notLookahead,
  on,
  openInjection,
  paint,
  popState,
  pushState,
  repeat,
  setState,
  token,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const whitespace = " \t\r\n";
const gap = repeat(
  choice(
    [bytes(whitespace)],
    [literal("#"), bytes(except(all, "\n"), { min: 0 })],
    [literal("/*"), repeat(notLookahead(literal("*/")), character()), literal("*/")],
  ),
);

const attributes = [
  "shellHook",
  "buildCommand",
  "preHook",
  "postHook",
  "preFetch",
  "postFetch",
  "preStart",
  "postStart",
  "preStop",
  "postStop",
  ...[
    "unpack",
    "patch",
    "configure",
    "build",
    "check",
    "install",
    "fixup",
    "installCheck",
    "dist",
  ].flatMap((phase) => [
    `${phase}Phase`,
    `pre${phase[0]!.toUpperCase()}${phase.slice(1)}`,
    `post${phase[0]!.toUpperCase()}${phase.slice(1)}`,
  ]),
];

export const shellFunctions = [
  ...["writeShellScript", "writeShellScriptBin"].map((text) => ({
    text,
    then: [paint("variable"), pushState("shellScriptName")],
  })),
  ...["runCommand", "runCommandLocal", "runCommandCC"].map((text) => ({
    text,
    then: [paint("variable"), pushState("shellCommandName")],
  })),
  {
    text: "writeShellApplication",
    then: [paint("variable"), pushState("shellApplicationArgument")],
  },
];

export function shellBindings(then: Effect[], application = false): Arm[] {
  const names = application ? [...attributes, "text"] : attributes;
  return ([false, true] as const).map((quoted) =>
    on(
      quoted ? '"' : "abcdefghijklmnopqrstuvwxyz",
      choice(...names.map((name) => [literal(quoted ? `"${name}"` : name)])),
      lookahead(gap, literal("="), gap, choice([literal('"')], [literal("''")])),
      paint(quoted ? "string" : "variable.member"),
      ...then,
      pushState("shellAssignment"),
    ),
  );
}

export function withShell(base: Record<string, State>, trivia: Arm[]): Record<string, State> {
  const argument = (next: string): State => ({
    style: "plain",
    arms: [
      ...trivia,
      token('"', "string", setState(next), pushState("double")),
      token("''", "string", setState(next), pushState("indented")),
      token("(", "punctuation.bracket", setState(next), pushState("parentheses")),
    ],
    otherwise: [popState()],
  });
  const states: Record<string, State> = {
    ...base,
    shellAssignment: {
      style: "plain",
      arms: [...trivia, token("=", "punctuation.delimiter", setState("shellValue"))],
      otherwise: [popState()],
    },
    shellValue: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", popState(), pushState("double")),
        token("''", "string", popState(), pushState("indented")),
      ],
      otherwise: [popState()],
    },
    shellScriptName: argument("shellValue"),
    shellCommandName: argument("shellCommandAttrs"),
    shellCommandAttrs: {
      style: "plain",
      arms: [
        ...trivia,
        token(
          "{",
          "punctuation.bracket",
          setState("shellValue"),
          pushState("braces"),
          pushState("bracesStart"),
        ),
        token("(", "punctuation.bracket", setState("shellValue"), pushState("parentheses")),
      ],
      otherwise: [popState()],
    },
    shellApplicationArgument: {
      style: "plain",
      arms: [
        ...trivia,
        token(
          "{",
          "punctuation.bracket",
          setState("shellApplication"),
          pushState("shellApplicationStart"),
        ),
      ],
      otherwise: [popState()],
    },
  };

  // Nix interpolation is a hole in one continuous Bash document. Nested Nix
  // strings stay in the parent; opening another child here would lose Bash state.
  const embeddedEffects = (effects: readonly Effect[]): Effect[] =>
    effects.flatMap<Effect>((effect) => {
      if (effect.kind === "paint") return [hostPrefix(), effect];
      if (effect.kind === "push" || effect.kind === "goto")
        return [{ ...effect, state: `${effect.state}Embedded` }];
      if (effect.kind === "pop" && effect.fallback)
        return [{ ...effect, fallback: `${effect.fallback}Embedded` }];
      if (effect.kind === "word")
        return [
          {
            ...effect,
            cases: effect.cases.map((entry) => ({ ...entry, then: embeddedEffects(entry.then) })),
            otherwise: embeddedEffects(effect.otherwise),
          },
        ];
      return [effect];
    });
  const embedded: Record<string, State> = {};
  for (const [name, state] of Object.entries(states)) {
    embedded[`${name}Embedded`] = {
      ...state,
      arms: [
        ...state.arms.map((arm) => ({ ...arm, then: embeddedEffects(arm.then) })),
        ...(state.otherwise ? [] : [on(all, character(), hostPrefix(), paint(state.style))]),
      ],
      ...(state.otherwise
        ? {
            otherwise:
              typeof state.otherwise === "string"
                ? `${state.otherwise}Embedded`
                : embeddedEffects(state.otherwise),
          }
        : {}),
    };
  }

  const interpolation = on(
    "$",
    literal("${"),
    hostPrefix(),
    paint("punctuation.special"),
    pushState("interpolationEmbedded"),
  );
  const escapedCharacter = (prefix: string) =>
    on(
      prefix[0]!,
      literal(prefix),
      lookahead(character()),
      hostPrefix(),
      paint("string.escape"),
      pushState("shellEscapedCharacter"),
    );
  const controlEscape = (prefix: string) =>
    on(prefix[0]!, literal(prefix), byte("nrt"), hostPrefix(), paint("string.escape"));
  return {
    ...states,
    ...embedded,
    shellValue: {
      style: "plain",
      arms: [
        ...trivia,
        token(
          '"',
          "string",
          openInjection({ static: "bash" }),
          popState(),
          pushState("shellDouble"),
        ),
        token(
          "''",
          "string",
          openInjection({ static: "bash" }),
          popState(),
          pushState("shellIndented"),
        ),
      ],
      otherwise: [popState()],
    },
    shellDouble: {
      style: "plain",
      arms: [
        controlEscape("\\"),
        escapedCharacter("\\"),
        token("$$", "plain"),
        interpolation,
        on('"', literal('"'), closeInjection(), paint("string"), popState()),
      ],
    },
    shellIndented: {
      style: "plain",
      arms: [
        on(
          "'",
          literal("'"),
          lookahead(literal("''")),
          hostPrefix(),
          paint("string.escape"),
          pushState("shellQuotePair"),
        ),
        on(
          "'",
          literal("''"),
          lookahead(literal("$")),
          hostPrefix(),
          paint("string.escape"),
          pushState("shellEscapedCharacter"),
        ),
        controlEscape("''\\"),
        escapedCharacter("''\\"),
        token("$$", "plain"),
        interpolation,
        on("'", literal("''"), closeInjection(), paint("string"), popState()),
      ],
    },
    shellEscapedCharacter: {
      style: "plain",
      arms: [on(all, character(), paint("plain"), popState())],
    },
    shellQuotePair: {
      style: "plain",
      arms: [token("''", "plain", popState())],
    },
  };
}
