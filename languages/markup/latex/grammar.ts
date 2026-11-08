import {
  byte,
  bytes,
  byteSet,
  character,
  closeInjection,
  defineGrammar,
  except,
  literal,
  lookahead,
  notNext,
  on,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  saveRange,
  setState,
  shell,
  slot,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const letters = union(range("a", "z"), range("A", "Z"), "@");
const languageChars = union(letters, range("0", "9"), "_+-.");
const space = " \t\r\n";
const language = slot.range("language");
const rawNames = ["verbatim", "lstlisting", "minted", "comment"] as const;
const command = (name: string, state: string) =>
  on("\\", literal("\\" + name), notNext(letters), paint("keyword"), pushState(state));
const rawOpen = rawNames.map((name) =>
  on(
    "\\",
    literal("\\begin"),
    notNext(letters),
    lookahead(bytes(space, { min: 0 }), literal("{" + name + "}")),
    paint("keyword"),
    pushState(`open-${name}`),
  ),
);
const commands = [
  ...rawOpen,
  ...["part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"].map(
    (s) => command(s, "titlePending"),
  ),
  ...["label", "ref", "pageref", "eqref", "autoref", "cite", "citep", "citet"].map((s) =>
    command(s, "referencePending"),
  ),
  command("begin", "environmentPending"),
  command("end", "environmentPending"),
  on(
    "\\",
    literal("\\verb"),
    notNext(letters),
    optional(literal("*")),
    paint("keyword"),
    pushState("verbOpen"),
  ),
  on("\\", literal("\\"), bytes(letters), paint("keyword")),
  on("\\", literal("\\"), character(), paint("keyword")),
];
const comments = token("%", "comment", pushState("lineComment"));
const math = [
  token("$$", "punctuation.special", pushState("mathDisplay")),
  token("$", "punctuation.special", pushState("mathInline")),
  token("\\(", "punctuation.special", pushState("mathParen")),
  token("\\[", "punctuation.special", pushState("mathBracket")),
];
const group = [
  token("{", "punctuation.bracket", pushState("group")),
  token("}", "punctuation.bracket"),
];
const mathGroup = [
  token("{", "punctuation.bracket", pushState("mathGroup")),
  token("}", "punctuation.bracket"),
];
const rawStates: Record<string, State> = {};
for (const name of rawNames) {
  const raw = `raw-${name}`;
  const end = `end-${name}`;
  rawStates[`open-${name}`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), paint("plain")),
      token("{", "punctuation.bracket"),
      token(name, "label"),
      token(
        "}",
        "punctuation.bracket",
        setState(name === "minted" ? "mintedStart" : name === "lstlisting" ? "listingStart" : raw),
      ),
    ],
  };
  rawStates[raw] = {
    style: name === "comment" ? "comment" : "text.literal",
    arms: [
      on(
        "\\",
        literal("\\end"),
        lookahead(literal("{" + name + "}")),
        paint("keyword"),
        setState(end),
      ),
    ],
  };
  rawStates[end] = {
    style: "plain",
    arms: [
      token("{", "punctuation.bracket"),
      token(name, "label"),
      token("}", "punctuation.bracket", popState()),
    ],
  };
}
const injected = (name: "minted" | "lstlisting"): State => ({
  style: "plain",
  arms: [
    on(
      "\\",
      literal("\\end"),
      lookahead(literal("{" + name + "}")),
      closeInjection(),
      paint("keyword"),
      setState(`end-${name}`),
    ),
  ],
});

// TeX catcode changes are not evaluated: @ is always a letter. Raw environment
// delimiters are recognized literally anywhere, not according to package-specific
// line rules. Minted accepts a plain language after at most one flat option list;
// listings accepts an unbraced language=NAME in a flat option list.
export default defineGrammar({
  name: "latex",
  extensions: ["tex", "ltx", "sty", "cls"],
  aliases: ["tex"],
  initial: "root",
  states: {
    root: { style: "plain", arms: [comments, ...math, ...commands, ...group] },
    group: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        comments,
        ...math,
        ...commands,
        token("{", "punctuation.bracket", pushState("group")),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    mathInline: {
      style: "text.literal",
      arms: [token("$", "punctuation.special", popState()), comments, ...commands, ...mathGroup],
    },
    mathDisplay: {
      style: "text.literal",
      arms: [token("$$", "punctuation.special", popState()), comments, ...commands, ...mathGroup],
    },
    mathParen: {
      style: "text.literal",
      arms: [token("\\)", "punctuation.special", popState()), comments, ...commands, ...mathGroup],
    },
    mathBracket: {
      style: "text.literal",
      arms: [token("\\]", "punctuation.special", popState()), comments, ...commands, ...mathGroup],
    },
    mathGroup: {
      style: "text.literal",
      arms: [
        token("}", "punctuation.bracket", popState()),
        comments,
        ...commands,
        token("{", "punctuation.bracket", pushState("mathGroup")),
      ],
    },
    titlePending: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("*", "punctuation.special"),
        token("[", "punctuation.bracket", pushState("option")),
        token("{", "punctuation.bracket", setState("title")),
      ],
      otherwise: [popState()],
    },
    title: {
      style: "text.title",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("title")),
        comments,
        ...math,
        ...commands,
      ],
    },
    referencePending: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("*", "punctuation.special"),
        token("[", "punctuation.bracket", pushState("option")),
        token("{", "punctuation.bracket", setState("reference")),
      ],
      otherwise: [popState()],
    },
    reference: {
      style: "text.reference",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("reference")),
        comments,
        ...commands,
      ],
    },
    option: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        token("[", "punctuation.bracket", pushState("option")),
        comments,
        ...commands,
      ],
    },
    environmentPending: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("{", "punctuation.bracket", setState("environmentName")),
      ],
      otherwise: [popState()],
    },
    environmentName: { style: "label", arms: [token("}", "punctuation.bracket", popState())] },
    verbOpen: {
      style: "plain",
      arms: [
        on(
          except(all, "\r\n"),
          character(),
          shell.captureReset(),
          shell.captureAppend(),
          paint("string"),
          setState("verbBody"),
        ),
      ],
      otherwise: [popState()],
    },
    verbBody: {
      style: "string",
      arms: [
        on(all, shell.captured(), paint("string"), popState()),
        redispatch("\r\n", popState()),
      ],
    },
    ...rawStates,
    mintedStart: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("[", "punctuation.bracket", setState("mintedOptions")),
        token("{", "punctuation.bracket", setState("mintedLanguage")),
      ],
      otherwise: [setState("raw-minted")],
    },
    mintedOptions: {
      style: "plain",
      arms: [token("]", "punctuation.bracket", setState("mintedLanguageStart"))],
    },
    mintedLanguageStart: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("{", "punctuation.bracket", setState("mintedLanguage")),
      ],
      otherwise: [setState("raw-minted")],
    },
    mintedLanguage: {
      style: "plain",
      arms: [
        on(
          languageChars,
          bytes(languageChars),
          lookahead(literal("}")),
          saveRange(language),
          paint("label"),
          setState("mintedLanguageEnd"),
        ),
      ],
      otherwise: [setState("raw-minted")],
    },
    mintedLanguageEnd: {
      style: "plain",
      arms: [
        token(
          "}",
          "punctuation.bracket",
          openInjection({ named: language }),
          setState("mintedInjected"),
        ),
      ],
    },
    mintedInjected: injected("minted"),
    listingStart: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("[", "punctuation.bracket", setState("listingOptions")),
      ],
      otherwise: [setState("raw-lstlisting")],
    },
    listingOptions: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on(
          "l",
          literal("language"),
          notNext(letters),
          lookahead(bytes(" \t", { min: 0 }), literal("=")),
          paint("attribute"),
          setState("listingEquals"),
        ),
        token(",", "plain"),
        token("]", "punctuation.bracket", setState("raw-lstlisting")),
      ],
      otherwise: [setState("listingSkip")],
    },
    listingSkip: {
      style: "plain",
      arms: [
        token("{", "plain", pushState("listingBraces")),
        token("[", "plain", pushState("listingBrackets")),
        token(",", "plain", setState("listingOptions")),
        token("]", "punctuation.bracket", setState("raw-lstlisting")),
      ],
    },
    listingBraces: {
      style: "plain",
      arms: [token("{", "plain", pushState("listingBraces")), token("}", "plain", popState())],
    },
    listingBrackets: {
      style: "plain",
      arms: [
        token("[", "plain", pushState("listingBrackets")),
        token("{", "plain", pushState("listingBraces")),
        token("]", "plain", popState()),
      ],
    },
    listingEquals: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("=", "operator", setState("listingLanguage")),
      ],
      otherwise: [setState("listingAmbiguous")],
    },
    listingLanguage: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(
          languageChars,
          bytes(languageChars),
          lookahead(byte(",] \t")),
          saveRange(language),
          paint("label"),
          setState("listingKnown"),
        ),
      ],
      otherwise: [setState("listingAmbiguous")],
    },
    listingKnown: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token(",", "plain", setState("listingKnownStart")),
        token(
          "]",
          "punctuation.bracket",
          openInjection({ named: language }),
          setState("listingInjected"),
        ),
      ],
      otherwise: [setState("listingAmbiguous")],
    },
    listingKnownStart: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on(
          "l",
          literal("language"),
          notNext(letters),
          lookahead(bytes(" \t", { min: 0 }), literal("=")),
          paint("attribute"),
          setState("listingAmbiguous"),
        ),
        token(",", "plain"),
        token(
          "]",
          "punctuation.bracket",
          openInjection({ named: language }),
          setState("listingInjected"),
        ),
      ],
      otherwise: [setState("listingKnownSkip")],
    },
    listingKnownSkip: {
      style: "plain",
      arms: [
        token("{", "plain", pushState("listingBraces")),
        token("[", "plain", pushState("listingBrackets")),
        token(",", "plain", setState("listingKnownStart")),
        token(
          "]",
          "punctuation.bracket",
          openInjection({ named: language }),
          setState("listingInjected"),
        ),
      ],
    },
    listingAmbiguous: {
      style: "plain",
      arms: [
        token("{", "plain", pushState("listingBraces")),
        token("[", "plain", pushState("listingBrackets")),
        token("]", "punctuation.bracket", setState("raw-lstlisting")),
      ],
    },
    listingInjected: injected("lstlisting"),
  },
});
