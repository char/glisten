import {
  byte,
  bytes,
  byteSet,
  choice,
  clearRange,
  closeInjection,
  defineGrammar,
  lineStart,
  literal,
  lookahead,
  matchRun,
  notNext,
  on,
  openInjection,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  saveRange,
  saveRun,
  setState,
  slot,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const alpha = union(range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const digit = range("0", "9");
const wordCharacter = union(alpha, digit);
const hex = union(digit, range("a", "f"), range("A", "F"));
const identifierStart = union(alpha, "_");
const identifier = union(identifierStart, digit, "-");
const label = union(identifier, ":./");
const language = union(range("a", "z"), range("A", "Z"), digit, "_+-.");
const urlBody = union(alpha, digit, "/#[]@$&()*+=%_-~");
const urlPunctuation = "!,.:;?'";
const run = slot.run("raw-delimiter");
const languageRange = slot.range("raw-language");
const states: Record<string, State> = {};
const comments: Arm[] = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
states.lineComment = { style: "comment", arms: [redispatch("\r\n", popState())] };
states.blockComment = {
  style: "comment",
  arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
};
const number = on(
  digit,
  bytes(digit),
  optional(literal("."), bytes(digit)),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  optional(choice([bytes(alpha)], [literal("%")])),
  paint("number"),
);
const keywords = `
  let set show import include if else for in while break continue return context as not and or
  with
`
  .trim()
  .split(/\s+/);
const constants = `
  none auto true false
`
  .trim()
  .split(/\s+/);
const words: Arm[] = [
  ...keywords.map((word) => on(word[0]!, literal(word), notNext(identifier), paint("keyword"))),
  ...constants.map((word) =>
    on(word[0]!, literal(word), notNext(identifier), paint("constant.builtin")),
  ),
  on(
    identifierStart,
    byte(identifierStart),
    bytes(identifier, { min: 0 }),
    lookahead(byte("([")),
    paint("function"),
  ),
  on(identifierStart, byte(identifierStart), bytes(identifier, { min: 0 }), paint("variable")),
];
const codeArms: Arm[] = [
  ...comments,
  token('"', "string", pushState("string")),
  token("$", "punctuation.special", pushState("math")),
  number,
  token("(", "punctuation.bracket", pushState("paren")),
  token("{", "punctuation.bracket", pushState("brace")),
  token("[", "punctuation.bracket", pushState("content")),
  on(".", literal("."), lookahead(byte(identifierStart)), paint("operator"), pushState("field")),
  token("=>", "operator"),
  token("==", "operator"),
  token("!=", "operator"),
  token("<=", "operator"),
  token(">=", "operator"),
  on("+-*/=<>!%", byte("+-*/=<>!%"), paint("operator")),
  on(",:;", byte(",:;"), paint("punctuation.delimiter")),
  ...words,
];
states.string = {
  style: "string",
  arms: [
    on("\\", literal("\\u{"), bytes(hex), literal("}"), paint("string.escape")),
    on("\\", literal("\\"), byte(all), paint("string.escape")),
    token('"', "string", popState()),
  ],
};
states.field = {
  style: "plain",
  arms: [
    on(
      identifierStart,
      byte(identifierStart),
      bytes(identifier, { min: 0 }),
      lookahead(byte("([")),
      paint("function"),
      popState(),
    ),
    on(
      identifierStart,
      byte(identifierStart),
      bytes(identifier, { min: 0 }),
      paint("variable.member"),
      popState(),
    ),
  ],
  otherwise: [popState()],
};
states.paren = {
  style: "plain",
  arms: [token(")", "punctuation.bracket", popState()), ...codeArms],
};
states.brace = {
  style: "plain",
  arms: [token("}", "punctuation.bracket", popState()), ...codeArms],
};
states.statement = {
  style: "plain",
  arms: [
    token(";", "punctuation.delimiter", popState()),
    redispatch("\r\n]", popState()),
    ...codeArms,
  ],
};
states.control = {
  style: "plain",
  arms: [
    token(";", "punctuation.delimiter", popState()),
    redispatch("\r\n]", popState()),
    token("[", "punctuation.bracket", setState("controlAfter"), pushState("content")),
    token("{", "punctuation.bracket", setState("controlAfter"), pushState("brace")),
    ...codeArms,
  ],
};
states.controlAfter = {
  style: "plain",
  arms: [
    on(" \t", bytes(" \t"), lookahead(literal("else"), notNext(identifier)), paint("plain")),
    on("e", literal("else"), notNext(identifier), paint("keyword"), setState("control")),
  ],
  otherwise: [setState("statement")],
};
states.codeHead = {
  style: "plain",
  arms: [
    ...`
      let set show import include return context
    `
      .trim()
      .split(/\s+/)
      .map((word) =>
        on(word[0]!, literal(word), notNext(identifier), paint("keyword"), setState("statement")),
      ),
    ...`
      if for while else
    `
      .trim()
      .split(/\s+/)
      .map((word) =>
        on(word[0]!, literal(word), notNext(identifier), paint("keyword"), setState("control")),
      ),
    ...`
      break continue
    `
      .trim()
      .split(/\s+/)
      .map((word) =>
        on(word[0]!, literal(word), notNext(identifier), paint("keyword"), setState("chain")),
      ),
    ...constants.map((word) =>
      on(
        word[0]!,
        literal(word),
        notNext(identifier),
        paint("constant.builtin"),
        setState("chain"),
      ),
    ),
    on(
      identifierStart,
      byte(identifierStart),
      bytes(identifier, { min: 0 }),
      lookahead(byte("([")),
      paint("function"),
      setState("chain"),
    ),
    on(
      identifierStart,
      byte(identifierStart),
      bytes(identifier, { min: 0 }),
      paint("variable"),
      setState("chain"),
    ),
    on(
      digit,
      bytes(digit),
      optional(literal("."), bytes(digit)),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      optional(choice([bytes(alpha)], [literal("%")])),
      paint("number"),
      setState("chain"),
    ),
    token('"', "string", setState("chain"), pushState("string")),
    token("(", "punctuation.bracket", setState("chain"), pushState("paren")),
    token("{", "punctuation.bracket", setState("chain"), pushState("brace")),
    token("[", "punctuation.bracket", setState("chain"), pushState("content")),
  ],
  otherwise: [popState()],
};
states.chain = {
  style: "plain",
  arms: [
    token("(", "punctuation.bracket", pushState("paren")),
    token("[", "punctuation.bracket", pushState("content")),
    on(".", literal("."), lookahead(byte(identifierStart)), paint("operator"), pushState("field")),
  ],
  otherwise: [popState()],
};
const code = token("#", "punctuation.special", pushState("codeHead"));
const math = token("$", "punctuation.special", pushState("math"));
states.math = {
  style: "plain",
  arms: [
    token("$", "punctuation.special", popState()),
    ...comments,
    code,
    token('"', "string", pushState("string")),
    on("\\", literal("\\"), paint("punctuation.special")),
    number,
    on(
      alpha,
      byte(alpha),
      bytes(union(alpha, digit), { min: 0 }),
      optional(literal("."), byte(alpha), bytes(union(alpha, digit), { min: 0 })),
      paint("variable"),
    ),
    on("^_/+-=", byte("^_/+-="), paint("operator")),
    on("&", byte("&"), paint("punctuation.special")),
    on("()[]{}", byte("()[]{}"), paint("punctuation.bracket")),
  ],
};
const escapes: Arm[] = [
  on("\\", literal("\\u{"), bytes(hex), literal("}"), paint("string.escape")),
  on("\\", literal("\\"), byte("\\`*_{}[]()<>#$@+-/=!~\"'"), paint("string.escape")),
  token("\\", "punctuation.special"),
];
const raw = [
  on(
    "`",
    bytes("`", { min: 3 }),
    saveRun(run),
    clearRange(languageRange),
    paint("text.literal"),
    pushState("fenceInfo"),
  ),
  token("``", "text.literal"),
  on("`", literal("`"), saveRun(run), paint("text.literal"), pushState("inlineRaw")),
];
states.inlineRaw = {
  style: "text.literal",
  arms: [on("`", matchRun(run, { relation: "prefix" }), paint("text.literal"), popState())],
};
states.fenceInfo = {
  style: "text.literal",
  arms: [
    on(
      language,
      bytes(language),
      saveRange(languageRange),
      paint("label"),
      setState("fenceLanguage"),
    ),
    token("\n", "text.literal", setState("fencePlain")),
  ],
  otherwise: [setState("fencePlain")],
};
states.fenceLanguage = {
  style: "text.literal",
  arms: [
    on("`", matchRun(run, { relation: "prefix" }), paint("text.literal"), popState()),
    on(
      " \t\r\n",
      byte(" \t\r\n"),
      paint("text.literal"),
      openInjection({ named: languageRange }),
      setState("fenceInjected"),
    ),
  ],
};
states.fencePlain = {
  style: "text.literal",
  arms: [on("`", matchRun(run, { relation: "prefix" }), paint("text.literal"), popState())],
};
states.fenceInjected = {
  style: "plain",
  arms: [
    on(
      "`",
      matchRun(run, { relation: "prefix" }),
      closeInjection(),
      paint("text.literal"),
      popState(),
    ),
  ],
};
const markupAtoms: Arm[] = [
  ...comments,
  ...raw,
  ...escapes,
  code,
  math,
  on("\"'", byte("\"'"), paint("punctuation.special")),
  on(
    "h",
    previousNotIn(identifier),
    choice([literal("https://")], [literal("http://")]),
    lookahead(byte(union(urlBody, urlPunctuation))),
    paint("text.uri"),
    pushState("url"),
  ),
  on(
    "<",
    literal("<"),
    byte(identifierStart),
    bytes(label, { min: 0 }),
    literal(">"),
    paint("label"),
  ),
  on("@", literal("@"), byte(identifierStart), bytes(label, { min: 0 }), paint("text.reference")),
  on(
    "_",
    previousNotIn(wordCharacter),
    literal("_"),
    paint("text.emphasis"),
    pushState("emphasis"),
  ),
  on("_", literal("_"), notNext(wordCharacter), paint("text.emphasis"), pushState("emphasis")),
  on("*", previousNotIn(wordCharacter), literal("*"), paint("text.strong"), pushState("strong")),
  on("*", literal("*"), notNext(wordCharacter), paint("text.strong"), pushState("strong")),
];
const lineMarkup: Arm[] = [
  on(
    " =",
    lineStart(),
    bytes(" \t", { min: 0 }),
    bytes("="),
    lookahead(byte(" \t")),
    paint("text.title"),
    pushState("heading"),
  ),
  on(
    " /",
    lineStart(),
    bytes(" \t", { min: 0 }),
    literal("/"),
    lookahead(byte(" \t")),
    paint("punctuation.special"),
    pushState("term"),
  ),
  on(
    " -+",
    lineStart(),
    bytes(" \t", { min: 0 }),
    byte("-+"),
    lookahead(byte(" \t")),
    paint("punctuation.special"),
  ),
];
states.url = {
  style: "plain",
  arms: [
    on(urlBody, bytes(urlBody), paint("text.uri")),
    on(urlPunctuation, bytes(urlPunctuation), lookahead(byte(urlBody)), paint("text.uri")),
  ],
  otherwise: [popState()],
};
states.root = { style: "plain", arms: [...lineMarkup, ...markupAtoms] };
states.content = {
  style: "plain",
  arms: [
    token("]", "punctuation.bracket", popState()),
    token("[", "plain", pushState("markupBracket")),
    ...lineMarkup,
    ...markupAtoms,
  ],
};
states.markupBracket = {
  style: "plain",
  arms: [
    token("]", "plain", popState()),
    token("[", "plain", pushState("markupBracket")),
    ...lineMarkup,
    ...markupAtoms,
  ],
};
states.heading = { style: "text.title", arms: [redispatch("\r\n", popState()), ...markupAtoms] };
states.term = {
  style: "plain",
  arms: [
    token(":", "punctuation.special", popState()),
    redispatch("\r\n", popState()),
    ...markupAtoms,
  ],
};
states.emphasis = {
  style: "text.emphasis",
  arms: [
    redispatch("]", popState()),
    on("_", previousNotIn(wordCharacter), literal("_"), paint("text.emphasis"), popState()),
    on("_", literal("_"), notNext(wordCharacter), paint("text.emphasis"), popState()),
    ...markupAtoms,
  ],
};
states.strong = {
  style: "text.strong",
  arms: [
    redispatch("]", popState()),
    on("*", previousNotIn(wordCharacter), literal("*"), paint("text.strong"), popState()),
    on("*", literal("*"), notNext(wordCharacter), paint("text.strong"), popState()),
    ...markupAtoms,
  ],
};
export default defineGrammar({
  name: "typst",
  extensions: ["typ"],
  aliases: ["typ"],
  initial: "root",
  states,
});
