import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
  type Arm,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit);
const ident = [byte(first), bytes(rest, { min: 0 })];
const gap = bytes(" \t", { min: 0 });
const routine = new Set(["procedure", "function", "constructor", "destructor", "operator"]);
const keywords =
  "absolute and array as asm begin case class const constref constructor destructor dispinterface div do downto else end except exports file finalization finally for function goto if implementation in inherited initialization interface is label library mod nil not object of on operator or out packed package procedure program property raise record repeat resourcestring set shl shr string then threadvar to try type unit until uses var while with xor private protected public published strict generic specialize helper".split(
    " ",
  );
const directives =
  "abstract assembler cdecl cppdecl cvar default deprecated dynamic experimental export external far forward implements index inline interrupt iocheck local message name near nodefault noreturn nostackframe overload override pascal platform read register reintroduce safecall sealed saveregisters static stdcall stored varargs virtual winapi write".split(
    " ",
  );
const base = [...new Set(keywords)].map((text) => ({
  text,
  then: [
    paint("keyword"),
    ...(routine.has(text)
      ? [pushState("routineName")]
      : text === "property"
        ? [pushState("propertyName")]
        : text === "type"
          ? [pushState("typeHead")]
          : []),
  ],
}));
const constants = keywordTable(["true", "false"], "constant.builtin");
const words = [...base, ...constants];
const propertyWords = [
  ...words,
  ...keywordTable(
    ["read", "write", "stored", "default", "nodefault", "implements", "index", "dispid"],
    "keyword",
  ),
];
const typeWords = [...keywordTable(keywords, "keyword"), ...constants].map(({ text, then }) => ({
  text,
  then: [popState(), ...then],
}));
const semiWords = [
  ...words.map(({ text, then }) => ({ text, then: [popState(), ...then] })),
  ...directives
    .filter((word) => !keywords.includes(word))
    .map((text) => ({ text, then: [popState(), paint("keyword")] })),
];
const comments: Arm[] = [
  token("{$", "keyword", pushState("braceDirective")),
  token("(*$", "keyword", pushState("parenDirective")),
  token("{", "comment", pushState("braceComment")),
  token("(*", "comment", pushState("parenComment")),
  token("//", "comment", pushState("lineComment")),
];
const code: Arm[] = [
  ...comments,
  on("'", literal("'''"), lookahead(byte("\r\n")), paint("string"), pushState("multiline")),
  token("'", "string", pushState("string")),
  on("#", literal("#"), choice([literal("$"), bytes(hex)], [bytes(digit)]), paint("string")),
  on("$", literal("$"), bytes(hex), paint("number")),
  on("%", literal("%"), bytes("01"), paint("number")),
  on("&", literal("&"), bytes("01234567"), notNext(rest), paint("number")),
  on("&", literal("&"), ...ident, paint("variable")),
  on(
    digit,
    bytes(digit),
    optional(literal("."), notNext("."), bytes(digit, { min: 0 })),
    optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    paint("number"),
  ),
  on(
    first,
    ...ident,
    lookahead(gap, literal("(")),
    classify(words, [paint("function")], { caseless: true }),
  ),
  on(first, ...ident, classify(words, [paint("variable")], { caseless: true })),
  token(";", "punctuation.delimiter", pushState("afterSemi")),
  token("..", "punctuation.delimiter"),
  token(":=", "operator"),
  token(":", "punctuation.delimiter", pushState("typeReference")),
  token(oneOf("()[]"), "punctuation.bracket"),
  token(oneOf(",."), "punctuation.delimiter"),
  token(oneOf("=+-*/<>@^"), "operator"),
];
export default defineGrammar({
  name: "pascal",
  aliases: ["delphi", "objectpascal"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    afterSemi: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(
          first,
          ...ident,
          lookahead(gap, literal("(")),
          classify(semiWords, [popState(), paint("function")], { caseless: true }),
        ),
        on(
          first,
          ...ident,
          classify(semiWords, [popState(), paint("variable")], { caseless: true }),
        ),
      ],
      otherwise: [popState()],
    },
    typeReference: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        token("^", "operator"),
        on(first, ...ident, lookahead(gap, literal(".")), paint("type")),
        token(".", "punctuation.delimiter"),
        on(first, ...ident, classify(typeWords, [popState(), paint("type")], { caseless: true })),
      ],
      otherwise: [popState()],
    },
    typeHead: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(first, ...ident, lookahead(gap, literal("=")), paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    propertyName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(first, ...ident, paint("function"), setState("propertyTail")),
      ],
      otherwise: [popState()],
    },
    propertyTail: {
      style: "plain",
      arms: [
        token(";", "punctuation.delimiter", popState(), pushState("afterSemi")),
        token("[", "punctuation.bracket", pushState("propertyIndex")),
        on(first, ...ident, classify(propertyWords, [paint("variable")], { caseless: true })),
        ...code,
      ],
    },
    propertyIndex: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        token(";", "punctuation.delimiter"),
        ...code,
      ],
    },
    routineName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(first, ...ident, lookahead(gap, literal(".")), paint("type")),
        token(".", "punctuation.delimiter"),
        on("&", literal("&"), ...ident, paint("function"), popState()),
        on(first, ...ident, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    string: {
      style: "string",
      arms: [
        token("''", "string.escape"),
        token("'", "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    multiline: {
      style: "string",
      arms: [
        on(
          " \t'",
          lineStart(),
          bytes(" \t", { min: 0 }),
          literal("'''"),
          paint("string"),
          popState(),
        ),
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    braceComment: { style: "comment", arms: [token("}", "comment", popState())] },
    parenComment: { style: "comment", arms: [token("*)", "comment", popState())] },
    braceDirective: { style: "keyword", arms: [token("}", "keyword", popState())] },
    parenDirective: { style: "keyword", arms: [token("*)", "keyword", popState())] },
  },
});
