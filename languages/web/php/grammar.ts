import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  hostPrefix,
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
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  shell,
  token,
  union,
  type Arm,
  type Effect,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const white = " \t\r\n";
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const keywords = `
  abstract and array as break callable case catch clone const continue declare default do echo
  else elseif enddeclare endfor endforeach endif endswitch endwhile eval exit extends final
  finally fn for foreach global goto if implements include include_once instanceof insteadof
  interface isset list match namespace new or print private protected public readonly require
  require_once return static switch throw trait try unset use var while xor yield from enum
  function class true false null self parent static
`
  .trim()
  .split(/\s+/);
const names = new Set(["function", "class", "interface", "trait", "enum"]);
const builtinTypes = `
  int integer float double real string bool boolean object mixed void never iterable resource
  binary
`
  .trim()
  .split(/\s+/);
const words = [...new Set([...keywords, ...builtinTypes])].map((text) => ({
  text,
  then: [
    paint(
      ["true", "false", "null"].includes(text)
        ? "constant.builtin"
        : [...builtinTypes, "array", "callable"].includes(text)
          ? "type"
          : "keyword",
    ),
    ...(names.has(text)
      ? [pushState(text === "function" ? "functionName" : "typeName")]
      : text === "new"
        ? [pushState("newType")]
        : []),
  ],
}));

function prefixHost(arm: Arm): Arm {
  if (arm.redispatch) return arm;
  const effect = arm.then[0];
  if (effect?.kind === "word")
    return {
      ...arm,
      then: [
        {
          ...effect,
          cases: effect.cases.map((c) => ({ ...c, then: [hostPrefix(), ...c.then] })),
          otherwise: [hostPrefix(), ...effect.otherwise],
        },
      ],
    };
  return { ...arm, then: [hostPrefix(), ...arm.then] };
}
function state(style: State["style"], arms: Arm[]): State {
  return {
    style,
    arms: [...arms.map(prefixHost), on(all, character(), hostPrefix(), paint(style))],
  };
}
const variable = [bytes("$"), ...ident];
const stringVariable = [
  literal("$"),
  ...ident,
  repeat(
    choice(
      [literal("->"), ...ident],
      [literal("["), choice([bytes(digit)], [...ident], [literal("$"), ...ident]), literal("]")],
    ),
  ),
];
const interpolation = [
  on(
    "{",
    literal("{"),
    lookahead(literal("$")),
    paint("punctuation.special"),
    pushState("interpolation"),
  ),
  token("${", "punctuation.special", pushState("interpolation")),
  on("$", ...stringVariable, paint("variable")),
];
const close = token("?>", "punctuation.special", pushState("phpHtml"));
const heredoc = on(
  "<",
  literal("<<<"),
  bytes(" \t", { min: 0 }),
  lookahead(
    choice(
      [...ident],
      [literal("'"), ...ident, literal("'")],
      [literal('"'), ...ident, literal('"')],
    ),
  ),
  paint("operator"),
  shell.captureReset(),
  pushState("heredocHeader"),
);
const body: Arm[] = [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  token("#[", "punctuation.special", pushState("attribute")),
  token("//", "comment", pushState("lineComment")),
  token("#", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  heredoc,
  token("'", "string", pushState("single")),
  token('"', "string", pushState("double")),
  token("`", "string", pushState("doubleBacktick")),
  token("${", "punctuation.special", pushState("interpolation")),
  on("$", ...variable, paint("variable")),
  on(
    digit,
    choice(
      [literal("0"), byte("xX"), bytes(hex)],
      [literal("0"), byte("bB"), bytes("01_")],
      [literal("0"), byte("oO"), bytes("01234567_")],
      [
        bytes(union(digit, "_")),
        optional(literal("."), bytes(union(digit, "_"), { min: 0 })),
        optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
      ],
    ),
    paint("number"),
  ),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(":")),
    classify(words, [paint("label")], { caseless: true }),
  ),
  on(
    start,
    ...ident,
    lookahead(bytes(white, { min: 0 }), literal("(")),
    classify(words, [paint("function")], { caseless: true }),
  ),
  on(upper, ...ident, classify(words, [paint("type")], { caseless: true })),
  on(start, ...ident, classify(words, [paint("variable")], { caseless: true })),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;"), "punctuation.delimiter"),
  on("\\", literal("\\"), paint("punctuation.delimiter")),
  ...[
    "?->",
    "??=",
    "===",
    "!==",
    "**=",
    "<<=",
    ">>=",
    "<=>",
    "...",
    "->",
    "::",
    "=>",
    "??",
    "**",
    "++",
    "--",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "+=",
    "-=",
    "*=",
    "/=",
    ".=",
    "%=",
    "&=",
    "|=",
    "^=",
    "<<",
    ">>",
    "<>",
  ].map((op) => token(op, "operator")),
  token(oneOf("!%&*+-./:<=>?@^|~"), "operator"),
];
const nested = [
  token("{", "punctuation.bracket", pushState("brace")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("[", "punctuation.bracket", pushState("bracket")),
];
const htmlState = (enter: Effect): State => ({
  style: "plain",
  arms: [
    on(
      "<",
      literal("<?"),
      byte("pP"),
      byte("hH"),
      byte("pP"),
      lookahead(byte(white)),
      hostPrefix(),
      paint("punctuation.special"),
      enter,
    ),
    on("<", literal("<?="), hostPrefix(), paint("punctuation.special"), enter),
  ],
});
const states: Record<string, State> = {
  initial: {
    style: "plain",
    arms: [],
    otherwise: [openInjection({ static: "html" }), setState("html")],
  },
  html: htmlState(pushState("php")),
  phpHtml: htmlState(popState()),
  php: state("plain", [close, ...body]),
  interpolation: state("plain", [
    token("}", "punctuation.special", popState()),
    ...nested,
    ...body,
  ]),
  brace: state("plain", [close, token("}", "punctuation.bracket", popState()), ...nested, ...body]),
  paren: state("plain", [close, token(")", "punctuation.bracket", popState()), ...nested, ...body]),
  bracket: state("plain", [
    close,
    token("]", "punctuation.bracket", popState()),
    ...nested,
    ...body,
  ]),
  attribute: state("plain", [
    close,
    token("]", "punctuation.special", popState()),
    token("(", "punctuation.bracket", pushState("paren")),
    on(start, ...ident, paint("attribute")),
    ...body,
  ]),
  newType: state("plain", [
    on(white, bytes(white), paint("plain")),
    token("\\", "punctuation.delimiter"),
    on(
      start,
      ...ident,
      classify(
        [{ text: "class", then: [paint("keyword"), popState()] }],
        [paint("type"), setState("newTypeTail")],
        { caseless: true },
      ),
    ),
    redispatch(all, popState()),
  ]),
  newTypeTail: state("plain", [
    token("\\", "punctuation.delimiter", setState("newType")),
    redispatch(all, popState()),
  ]),
  functionName: state("plain", [
    on(white, bytes(white), paint("plain")),
    token("&", "operator"),
    on(start, ...ident, paint("function"), popState()),
    redispatch(all, popState()),
  ]),
  typeName: state("plain", [
    on(white, bytes(white), paint("plain")),
    on(start, ...ident, classify(words, [paint("type"), popState()], { caseless: true })),
    redispatch(all, popState()),
  ]),
  lineComment: state("comment", [
    on("?", literal("?>"), paint("punctuation.special"), popState(), pushState("phpHtml")),
    on("\r\n", byte("\r\n"), paint("plain"), popState()),
  ]),
  blockComment: state("comment", [token("*/", "comment", popState())]),
  single: state("string", [
    on("\\", literal("\\"), byte("\\'"), paint("string.escape")),
    token("'", "string", popState()),
  ]),
  double: state("string", [
    on("\\", literal("\\"), character(), paint("string.escape")),
    ...interpolation,
    token('"', "string", popState()),
  ]),
  doubleBacktick: state("string", [
    on("\\", literal("\\"), character(), paint("string.escape")),
    ...interpolation,
    token("`", "string", popState()),
  ]),
  heredocHeader: state("label", [
    on(
      start,
      ...ident,
      paint("label"),
      shell.captureAppend(),
      shell.queueSave({ footerIndent: "whitespace" }),
      setState("heredocLine"),
    ),
    token("'", "label", shell.captureMark(1), setState("heredocSingleName")),
    token('"', "label", setState("heredocDoubleName")),
  ]),
  heredocSingleName: state("label", [
    on(start, ...ident, paint("label"), shell.captureAppend(), setState("heredocSingleEnd")),
  ]),
  heredocDoubleName: state("label", [
    on(start, ...ident, paint("label"), shell.captureAppend(), setState("heredocDoubleEnd")),
  ]),
  heredocSingleEnd: state("label", [
    token("'", "label", shell.queueSave({ footerIndent: "whitespace" }), setState("heredocLine")),
  ]),
  heredocDoubleEnd: state("label", [
    token('"', "label", shell.queueSave({ footerIndent: "whitespace" }), setState("heredocLine")),
  ]),
  heredocLine: state("label", [
    on("\r\n", optional(literal("\r")), literal("\n"), paint("string"), setState("heredocBody")),
  ]),
  heredocBody: state("string", [
    on(
      union(" \t", start),
      lineStart(),
      bytes(" \t", { min: 0 }),
      shell.queueText(),
      notNext(rest),
      paint("label"),
      shell.queueShift(),
      popState(),
    ),
    on("\\", shell.queueHas(1, 0), literal("\\"), character(), paint("string.escape")),
    ...interpolation.map((arm) => ({ ...arm, match: [shell.queueHas(1, 0), ...arm.match] })),
  ]),
};
export default defineGrammar({ name: "php", initial: "initial", states });
