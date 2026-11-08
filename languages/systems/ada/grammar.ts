import {
  byte,
  byteSet,
  bytes,
  character,
  classify,
  defineGrammar,
  keywordTable,
  literal,
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
} from "#/grammar/mod.ts";

const digit = range("0", "9");
// Non-ASCII bytes are accepted without checking Unicode identifier categories.
const letter = union(range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const identifierRest = union(letter, digit, "_");
const numeral = union(digit, "_");
const basedDigit = union(numeral, range("a", "f"), range("A", "F"));
const keywords = `
  abort abs abstract accept access aliased and array at begin body case constant declare delay
  delta digits do else elsif end exception exit for goto if in interface is limited loop mod new
  not of or others out overriding parallel pragma protected range rem renames requeue return
  reverse select separate some subtype synchronized tagged task terminate then type until use
  when while with xor
`
  .trim()
  .split(/\s+/);
const exponent = optional(byte("eE"), optional(byte("+-")), bytes(numeral));
const comment = token("--", "comment", pushState("comment"));
const whitespace = on(" \t\r\n", bytes(" \t\r\n"), paint("plain"));
const withAfterHead = on(
  "wW",
  byte("wW"),
  byte("iI"),
  byte("tT"),
  byte("hH"),
  notNext(identifierRest),
  paint("keyword"),
  setState("withHead"),
);
const syntax = [
  comment,
  token('"', "string", pushState("string")),
  on(
    "'",
    literal("'"),
    notNext("\r\n"),
    character(),
    literal("'"),
    paint("string"),
    pushState("afterHead"),
  ),
  // Numerals accept runs of digits and underscores, plus A-F in based digits;
  // underscore placement, base range, and digit values within the base are not checked.
  on(
    digit,
    bytes(numeral),
    literal("#"),
    bytes(basedDigit),
    optional(literal("."), bytes(basedDigit)),
    literal("#"),
    exponent,
    paint("number"),
    pushState("afterHead"),
  ),
  on(
    digit,
    bytes(numeral),
    optional(literal("."), notNext("."), bytes(numeral)),
    exponent,
    paint("number"),
    pushState("afterHead"),
  ),
  on(
    letter,
    byte(letter),
    bytes(identifierRest, { min: 0 }),
    classify(
      [
        { text: "all", then: [paint("keyword"), pushState("post")] },
        { text: "generic", then: [paint("keyword"), setState("boundary")] },
        { text: "raise", then: [paint("keyword"), pushState("raiseName")] },
        ...["null", "private", "record"].map((text) => ({
          text,
          then: [paint("keyword"), pushState("afterHead")],
        })),
        ...["entry", "function", "package", "procedure"].map((text) => ({
          text,
          then: [paint("keyword"), pushState("declarationName")],
        })),
        ...keywordTable(keywords, "keyword"),
      ],
      [paint("variable"), pushState("post")],
      { caseless: true },
    ),
  ),
  ...[":=", "=>", "..", "**", "/=", "<=", ">=", "<<", ">>", "<>"].map((operator) =>
    token(operator, "operator"),
  ),
  token(oneOf("+-*/=&<>|"), "operator"),
  token(")", "punctuation.bracket", pushState("post")),
  token(oneOf("([{}]"), "punctuation.bracket"),
  token(";", "punctuation.delimiter", setState("boundary")),
  token(oneOf(".,:"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "ada",
  aliases: ["adb", "ads"],
  initial: "boundary",
  states: {
    // At document start, after semicolons, or after generic, with starts a context
    // clause or generic formal; limited/private can precede a context clause.
    // After a declaration head it starts an aspect, except with record, with null
    // record, and with private. This is lexical: library nesting and arbitrary
    // declaration heads are not parsed, and semicolons inside expressions are approximate.
    boundary: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          "lL",
          byte("lL"),
          byte("iI"),
          byte("mM"),
          byte("iI"),
          byte("tT"),
          byte("eE"),
          byte("dD"),
          notNext(identifierRest),
          paint("keyword"),
        ),
        on(
          "pP",
          byte("pP"),
          byte("rR"),
          byte("iI"),
          byte("vV"),
          byte("aA"),
          byte("tT"),
          byte("eE"),
          notNext(identifierRest),
          paint("keyword"),
        ),
      ],
      otherwise: [setState("root")],
    },
    root: { style: "plain", arms: syntax },
    // Ada resolves a tick after an identifier, right parenthesis or all as an attribute tick.
    post: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        token("'", "punctuation.special", setState("attribute")),
        withAfterHead,
      ],
      otherwise: [popState()],
    },
    afterHead: {
      style: "plain",
      arms: [whitespace, comment, withAfterHead],
      otherwise: [popState()],
    },
    withHead: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          letter,
          byte(letter),
          bytes(identifierRest, { min: 0 }),
          classify(
            ["record", "null", "private"].map((text) => ({
              text,
              then: [paint("keyword"), popState()],
            })),
            [paint("attribute"), setState("aspect")],
            { caseless: true },
          ),
        ),
      ],
      otherwise: [popState()],
    },
    // A raise statement or expression can also use with, before its message.
    raiseName: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          letter,
          byte(letter),
          bytes(identifierRest, { min: 0 }),
          paint("variable"),
          setState("raiseAfter"),
        ),
      ],
      otherwise: [popState()],
    },
    raiseAfter: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        token(".", "punctuation.delimiter", setState("raiseName")),
        on(
          "wW",
          byte("wW"),
          byte("iI"),
          byte("tT"),
          byte("hH"),
          notNext(identifierRest),
          paint("keyword"),
          popState(),
        ),
      ],
      otherwise: [popState()],
    },
    // This lexical declaration-name state does not resolve access-to-subprogram types.
    declarationName: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          letter,
          byte(letter),
          bytes(identifierRest, { min: 0 }),
          classify(
            [{ text: "body", then: [paint("keyword")] }],
            [paint("function"), setState("post")],
            { caseless: true },
          ),
        ),
        token('"', "function", setState("operatorName")),
      ],
      otherwise: [popState()],
    },
    operatorName: {
      style: "function",
      arms: [token('"', "function", popState()), redispatch("\r\n", popState())],
    },
    attribute: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          letter,
          byte(letter),
          bytes(identifierRest, { min: 0 }),
          paint("attribute"),
          setState("post"),
        ),
      ],
      otherwise: [popState()],
    },
    aspectHead: {
      style: "plain",
      arms: [
        whitespace,
        comment,
        on(
          letter,
          byte(letter),
          bytes(identifierRest, { min: 0 }),
          paint("attribute"),
          setState("aspect"),
        ),
      ],
      otherwise: [popState()],
    },
    aspect: {
      style: "plain",
      arms: [
        token(";", "punctuation.delimiter", popState(), setState("boundary")),
        token(",", "punctuation.delimiter", setState("aspectHead")),
        token("(", "punctuation.bracket", pushState("aspectNested")),
        ...syntax,
      ],
    },
    aspectNested: {
      style: "plain",
      arms: [
        token(";", "punctuation.delimiter"),
        token("(", "punctuation.bracket", pushState("aspectNested")),
        token(")", "punctuation.bracket", popState(), pushState("post")),
        ...syntax,
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: {
      style: "string",
      arms: [
        token('""', "string.escape"),
        token('"', "string", popState(), pushState("afterHead")),
        redispatch("\r\n", popState()),
      ],
    },
  },
});
