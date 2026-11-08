import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  indentTo,
  keywordTable,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notLookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  saveColumn,
  setState,
  slot,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const high = byteSet({ ranges: [[128, 255]] });
const asciiStart = union("_", range("a", "z"), upper);
const asciiRest = union(asciiStart, digit, "'");
const start = union(asciiStart, high);
const operators = [
  "→",
  "←",
  "↔",
  "↦",
  "≤",
  "≥",
  "≠",
  "∧",
  "∨",
  "¬",
  "∀",
  "∃",
  "⟨",
  "⟩",
  "·",
  "×",
  "÷",
  "⊕",
  "⊗",
  "∈",
  "∉",
  "∪",
  "∩",
  "⊆",
  "⊂",
  "⊤",
  "⊥",
  "∅",
  "λ",
  "«",
  "»",
];
const unicodeOp = choice(...operators.map((op) => [literal(op)]));
const unicodeName = [lookahead(byte(high)), notLookahead(unicodeOp), character()];
const ident = [
  choice([bytes(asciiStart)], unicodeName),
  repeat(choice([bytes(asciiRest)], unicodeName)),
  optional(byte("?!"), notNext("=")),
];
const keywords = `
  where deriving namespace section end open export variable variables universe universes import
  fun let have show from calc match with if then else do for in return extends private protected
  noncomputable unsafe partial mutual termination_by decreasing_by macro syntax notation infix
  infixl infixr prefix postfix attribute set_option example
`
  .trim()
  .split(/\s+/);
const declarations = ["def", "theorem", "lemma", "abbrev", "axiom", "opaque", "constant"];
const types = ["structure", "class", "inductive"];
const tactics = `
  intro intros simp simp_all rw rfl exact apply induction cases omega aesop assumption trivial
  constructor refine have show decide norm_num linarith ring unfold dsimp change contradiction
  obtain rcases ext funext exists use
`
  .trim()
  .split(/\s+/);
const tacticColumn = slot.column("tactic");
const all = byteSet({ ranges: [[0, 255]] });
const hex = union(digit, range("a", "f"), range("A", "F"));
const number = [
  choice(
    [literal("0x"), bytes(union(hex, "_"))],
    [literal("0b"), bytes("01_")],
    [
      bytes(union(digit, "_")),
      optional(literal("."), notNext("."), bytes(union(digit, "_"))),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
];
const bracketOpeners = [
  ["⟨", "angle"],
  ["(", "paren"],
  ["[", "bracket"],
  ["{", "brace"],
] as const;
const braces = [
  ["paren", ")"],
  ["bracket", "]"],
  ["brace", "}"],
  ["angle", "⟩"],
  ["interp", "}"],
] as const;
// The shared tokenizer uses one stack frame: an identifier inside 126 nested
// parentheses succeeds, while 127 reaches the engine's 128-frame depth limit.
function code(close = ""): Arm[] {
  return [
    ...(close ? [token(close, "punctuation.bracket", popState())] : []),
    on(" \t\r", bytes(" \t\r"), paint("plain")),
    token("\n", "plain"),
    on(
      "b",
      literal("by"),
      nameEnd,
      paint("keyword"),
      pushState(close ? "tacticFirstInside" : "tacticFirst"),
      saveColumn(tacticColumn),
    ),
  ];
}
function codeToken(): Arm[] {
  const cases = [
    ...keywordTable(declarations, "keyword", () => [popState(), pushState("functionName")]),
    ...keywordTable(types, "keyword", () => [popState(), pushState("typeName")]),
    { text: "instance", then: [paint("keyword"), popState(), pushState("functionName")] },
    ...keywordTable(keywords, "keyword", () => [popState()]),
    ...keywordTable(["true", "false", "sorry"], "constant.builtin", () => [popState()]),
  ];
  return [
    on(" \t\r", bytes(" \t\r"), paint("plain"), popState()),
    token("\n", "plain", popState()),
    token("--", "comment", popState(), pushState("lineComment")),
    token("/-", "comment", popState(), pushState("blockComment")),
    token("@[", "attribute", popState(), pushState("attribute")),
    on("#", literal("#"), bytes(union(asciiStart, digit)), paint("keyword"), popState()),
    on(
      "sfm",
      byte("sfm"),
      literal('!"'),
      paint("string"),
      popState(),
      pushState("interpolatedString"),
    ),
    token('"', "string", popState(), pushState("string")),
    on(
      "'",
      literal("'"),
      choice(
        [literal("\\u{"), bytes(hex), literal("}")],
        [literal("\\"), character()],
        [character()],
      ),
      literal("'"),
      paint("string"),
      popState(),
    ),
    token("«", "variable", popState(), pushState("quotedName")),
    on(digit, ...number, paint("number"), popState()),
    token("λ", "keyword", popState()),
    ...bracketOpeners.map(([open, state]) =>
      token(open, "punctuation.bracket", popState(), pushState(state)),
    ),
    ...operators
      .filter((op) => !["λ", "⟨", "⟩", "«", "»"].includes(op))
      .map((op) => token(op, "operator", popState())),
    ...[":=", "=>", "->", "<-", "<=", ">=", "!=", "==", "&&", "||", "++", "::"].map((op) =>
      token(op, "operator", popState()),
    ),
    token(".", "punctuation.special", popState(), pushState("field")),
    token(oneOf(":,;"), "punctuation.delimiter", popState()),
    token(oneOf("=<>+-*/%^|&!~?"), "operator", popState()),
    on(upper, ...ident, classify(cases, [paint("type"), popState()])),
    on(start, ...ident, classify(cases, [paint("variable"), popState()])),
    token(oneOf(")]}"), "punctuation.bracket", popState()),
    token("⟩", "punctuation.bracket", popState()),
  ];
}
// Lexical layout approximation: the first token after by, a focus bullet, or a
// case arrow sets the block column. Nonblank dedents pop blocks; a token at that
// column, after a semicolon, <;>, bullet, or => starts a tactic. A closing outer
// bracket, or a top-level comma in a block opened inside a bracket, ends it;
// brackets opened inside the block retain tactic context. Multiline terms may
// dedent legitimately, and comma-taking tactics inside brackets can end a block
// prematurely. Lean's extensible parser determines actual tactic boundaries.
const tacticBrackets = { paren: ")", bracket: "]", brace: "}", angle: "⟩" } as const;
type TacticContext = "block" | "inside" | keyof typeof tacticBrackets;
type TacticPhase = "start" | "body" | "case";
const tacticState = (context: TacticContext, phase: TacticPhase) => `tactic_${context}_${phase}`;
const tacticGuard = (context: TacticContext, phase: TacticPhase) =>
  `tacticGuard_${context}_${phase}`;
const firstTactic = (context: TacticContext) =>
  context === "block" ? "tacticFirst" : "tacticFirstInside";

const nameEnd = notLookahead(choice([byte(asciiRest)], unicodeName, [byte("?!"), notNext("=")]));

function tacticCode(context: TacticContext, phase: TacticPhase): Arm[] {
  const startState = tacticState(context, "start");
  const close =
    context in tacticBrackets ? tacticBrackets[context as keyof typeof tacticBrackets] : "";
  const begin = [
    setState(tacticGuard(context, "body")),
    pushState(firstTactic(context)),
    saveColumn(tacticColumn),
  ];
  return [
    ...(close ? [token(close, "punctuation.bracket", popState())] : []),
    redispatch(")]}", popState()),
    redispatch(byteSet({ bytes: [0xe2] }), lookahead(literal("⟩")), popState()),
    ...(context === "inside" ? [redispatch(",", popState())] : []),
    ...(phase === "start"
      ? [
          on(" \t\r", bytes(" \t\r"), paint("plain")),
          token("\n", "plain", setState(tacticGuard(context, phase))),
          token("--", "comment", setState(tacticGuard(context, phase)), pushState("lineComment")),
          token("/-", "comment", setState(tacticGuard(context, phase)), pushState("blockComment")),
        ]
      : []),
    on("b", literal("by"), nameEnd, paint("keyword"), ...begin),
    ...(phase === "start"
      ? [
          on(
            "c",
            literal("case"),
            nameEnd,
            paint("keyword"),
            setState(tacticState(context, "case")),
          ),
          on(
            "n",
            literal("next"),
            nameEnd,
            paint("keyword"),
            setState(tacticState(context, "case")),
          ),
          token("·", "operator", ...begin),
          token(".", "operator", ...begin),
        ]
      : []),
    ...(phase === "case"
      ? [token("=>", "operator", ...begin)]
      : [token("=>", "operator", setState(startState))]),
    token("<;>", "operator", setState(startState)),
    token(";", "punctuation.delimiter", setState(startState)),
    ...bracketOpeners.map(([open, name]) =>
      token(
        open,
        "punctuation.bracket",
        setState(tacticGuard(context, phase === "case" ? "case" : "body")),
        pushState(tacticState(name, phase === "start" ? "start" : "body")),
      ),
    ),
  ];
}

const tacticCases = [
  ...keywordTable(declarations, "keyword", () => [popState(), pushState("functionName")]),
  ...keywordTable(types, "keyword", () => [popState(), pushState("typeName")]),
  { text: "instance", then: [paint("keyword"), popState(), pushState("functionName")] },
  ...keywordTable(
    keywords.filter((word) => !tactics.includes(word)),
    "keyword",
    () => [popState()],
  ),
  ...keywordTable(["true", "false", "sorry"], "constant.builtin", () => [popState()]),
  ...keywordTable(tactics, "function", () => [popState()]),
];

const states: Record<string, State> = {
  root: { style: "plain", arms: code(), otherwise: [pushState("codeToken")] },
};
for (const context of ["block", "inside", "paren", "bracket", "brace", "angle"] as const) {
  for (const phase of ["start", "body", "case"] as const) {
    const state = tacticState(context, phase);
    states[state] = {
      style: "plain",
      arms: tacticCode(context, phase),
      otherwise: [
        setState(tacticGuard(context, phase === "case" ? "case" : "body")),
        pushState(phase === "start" ? "tacticTokenStart" : "codeToken"),
      ],
    };
    states[tacticGuard(context, phase)] = {
      style: "plain",
      arms: [
        redispatch(
          all,
          lineStart(),
          notLookahead(optional(bytes(" \t")), optional(literal("\r")), lineEnd()),
          notLookahead(indentTo(tacticColumn)),
          popState(),
        ),
        ...(phase === "body"
          ? [
              redispatch(
                all,
                lineStart(),
                lookahead(indentTo(tacticColumn), notNext(" \t\r\n")),
                setState(tacticState(context, "start")),
              ),
            ]
          : []),
      ],
      otherwise: [setState(state)],
    };
  }
}
states.tacticTokenStart = {
  style: "plain",
  arms: [
    on(
      "sfm",
      byte("sfm"),
      literal('!"'),
      paint("string"),
      popState(),
      pushState("interpolatedString"),
    ),
    on(upper, ...ident, classify(tacticCases, [paint("type"), popState()])),
    on(start, ...ident, classify(tacticCases, [paint("variable"), popState()])),
  ],
  otherwise: [setState("codeToken")],
};
for (const context of ["block", "inside"] as const) {
  const first = firstTactic(context);
  const pendingComment = `${first}Comment`;
  states[first] = {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain"), saveColumn(tacticColumn)),
      token("--", "comment", pushState("lineComment")),
      token("/-", "comment", setState(pendingComment)),
      redispatch(all, setState(tacticState(context, "start"))),
    ],
  };
  states[pendingComment] = {
    style: "comment",
    arms: [
      token("/-", "comment", pushState("blockComment")),
      token("-/", "comment", saveColumn(tacticColumn), setState(first)),
    ],
  };
}
for (const [name, close] of braces)
  states[name] = { style: "plain", arms: code(close), otherwise: [pushState("codeToken")] };
states.codeToken = { style: "plain", arms: codeToken(), otherwise: "codeTokenDone" };
states.codeTokenDone = { style: "plain", arms: [redispatch(all, popState())] };
Object.assign(states, {
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  blockComment: {
    style: "comment",
    arms: [token("/-", "comment", pushState("blockComment")), token("-/", "comment", popState())],
  },
  string: {
    style: "string",
    arms: [
      on("\\", literal("\\"), character(), paint("string.escape")),
      token('"', "string", popState()),
    ],
  },
  interpolatedString: {
    style: "string",
    arms: [
      on("\\", literal("\\"), character(), paint("string.escape")),
      token("{{", "string"),
      token("}}", "string"),
      token("{", "punctuation.special", pushState("interp")),
      token('"', "string", popState()),
    ],
  },
  quotedName: { style: "variable", arms: [token("»", "variable", popState())] },
  attribute: {
    style: "attribute",
    arms: [
      token("[", "attribute", pushState("attribute")),
      token("]", "attribute", popState()),
      token('"', "attribute", pushState("attributeString")),
    ],
  },
  attributeString: {
    style: "attribute",
    arms: [
      on("\\", literal("\\"), character(), paint("attribute")),
      token('"', "attribute", popState()),
    ],
  },
  field: {
    style: "plain",
    arms: [on(start, ...ident, paint("variable.member"), popState())],
    otherwise: [popState()],
  },
  functionName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(start, ...ident, paint("function"), popState()),
      token("«", "function", setState("quotedFunction")),
    ],
    otherwise: [popState()],
  },
  typeName: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(start, ...ident, paint("type"), popState()),
      token("«", "type", setState("quotedType")),
    ],
    otherwise: [popState()],
  },
  quotedFunction: { style: "function", arms: [token("»", "function", popState())] },
  quotedType: { style: "type", arms: [token("»", "type", popState())] },
});
export default defineGrammar({ name: "lean", extensions: ["lean"], initial: "root", states });
