import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
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
  type State,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const keywords = `
  if else while for in do break continue next nextfile exit return delete getline function func
  switch case default
`
  .trim()
  .split(/\s+/);
const values = `
  ARGC ARGV ARGIND CONVFMT ENVIRON ERRNO FIELDWIDTHS FILENAME FNR FPAT FS FUNCTAB IGNORECASE LINT
  NF NR OFMT OFS ORS PREC PROCINFO ROUNDMODE RS RT RSTART RLENGTH SUBSEP SYMTAB TEXTDOMAIN BINMODE
`
  .trim()
  .split(/\s+/);
const functions = `
  atan2 cos sin exp log sqrt int rand srand asort asorti gensub gsub index length match patsplit
  split sprintf strtonum sub substr tolower toupper mktime strftime systime close fflush system
  bindtextdomain dcgettext dcngettext isarray typeof and compl lshift or rshift xor
`
  .trim()
  .split(/\s+/);
const statements = `
  print printf
`
  .trim()
  .split(/\s+/);
const special = `
  BEGIN END BEGINFILE ENDFILE
`
  .trim()
  .split(/\s+/);

const escape = on("\\", literal("\\"), character(), paint("string.escape"));

// Gawk's awkgram.y regexp production sets want_regexp for the lexer: after an
// operand, slash is division, not an implicitly concatenated regexp. Parent frames retain the result expected
// after a control condition or an ordinary parenthesized expression.
const number = (after: string) =>
  on(
    union(digit, "."),
    choice(
      [
        literal("0"),
        byte("xX"),
        bytes(hex),
        optional(literal("."), bytes(hex, { min: 0 })),
        optional(byte("pP"), optional(byte("+-")), bytes(digit)),
      ],
      [
        bytes(digit),
        optional(literal("."), bytes(digit, { min: 0 })),
        optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      ],
      [literal("."), bytes(digit), optional(byte("eE"), optional(byte("+-")), bytes(digit))],
    ),
    paint("number"),
    setState(after),
  );
function expressionStates<F extends "root" | "paren">(
  frame: F,
): Record<`${F}Expect` | `${F}After` | `${F}Control`, State> {
  const expect = frame + "Expect";
  const after = frame + "After";
  const control = frame + "Control";
  const wordCases = [
    ...["if", "while", "for", "switch"].map((text) => ({
      text,
      then: [paint("keyword"), setState(control)],
    })),
    ...keywords
      .filter((text) => !["if", "while", "for", "switch"].includes(text))
      .map((text) => ({ text, then: [paint("keyword"), setState(expect)] })),
    ...statements.map((text) => ({
      text,
      then: [paint("function"), setState(expect)],
    })),
    ...special.map((text) => ({
      text,
      then: [paint("keyword"), setState(expect)],
    })),
    ...values.map((text) => ({
      text,
      then: [paint("constant.builtin"), setState(after)],
    })),
    ...functions.map((text) => ({
      text,
      then: [paint("function"), setState(after)],
    })),
  ];
  const common = [
    token("\\\n", "string.escape"),
    token("\\\r\n", "string.escape"),
    token("#", "comment", pushState("comment")),
    token('"', "string", setState(after), pushState("string")),
    token("@/", "string", setState(after), pushState("regex")),
    number(after),
    on(
      start,
      byte(start),
      bytes(rest, { min: 0 }),
      lookahead(literal("(")),
      classify(wordCases, [paint("function"), setState(after)]),
    ),
    on(
      start,
      byte(start),
      bytes(rest, { min: 0 }),
      classify(wordCases, [paint("variable"), setState(after)]),
    ),
    ...["@include", "@namespace", "@load"].map((s) =>
      on("@", literal(s), notNext(rest), paint("keyword"), setState(expect)),
    ),
    token("$", "punctuation.special", setState(expect)),
    ...[
      "!~",
      "==",
      "!=",
      "<=",
      ">=",
      "&&",
      "||",
      "+=",
      "-=",
      "*=",
      "%=",
      "^=",
      "**=",
      "**",
      ">>",
      "|&",
    ].map((s) => token(s, "operator", setState(expect))),
    token(oneOf("+-*%^!~<>=?|:"), "operator", setState(expect)),
    token("(", "punctuation.bracket", setState(after), pushState("parenExpect")),
    frame === "paren"
      ? token(")", "punctuation.bracket", popState())
      : token(")", "punctuation.bracket", setState(after)),
    token("[", "punctuation.bracket", setState(expect)),
    token("]", "punctuation.bracket", setState(after)),
    token(oneOf("{}"), "punctuation.bracket", setState(expect)),
    token(oneOf(",;"), "punctuation.delimiter", setState(expect)),
  ];
  const result: Record<string, State> = {
    [expect]: {
      style: "plain",
      arms: [
        token("/", "string", setState(after), pushState("regex")),
        token("++", "operator"),
        token("--", "operator"),
        ...common,
        ...(frame === "root" ? [token("\n", "plain", setState(expect))] : []),
      ],
    },
    [after]: {
      style: "plain",
      arms: [
        token("/=", "operator", setState(expect)),
        token("/", "operator", setState(expect)),
        token("++", "operator"),
        token("--", "operator"),
        ...common,
        ...(frame === "root" ? [token("\n", "plain", setState(expect))] : []),
      ],
    },
    [control]: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token("\\\n", "string.escape"),
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token("(", "punctuation.bracket", setState(expect), pushState("parenExpect")),
      ],
      otherwise: [setState(expect)],
    },
  };
  return result as Record<`${F}Expect` | `${F}After` | `${F}Control`, State>;
}

export default defineGrammar({
  name: "awk",
  extensions: ["awk"],
  aliases: ["gawk", "mawk", "nawk"],
  initial: "rootExpect",
  states: {
    ...expressionStates("root"),
    ...expressionStates("paren"),
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    regex: {
      style: "string",
      arms: [
        escape,
        token("[", "string", pushState("regexClassStart")),
        token("/", "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    regexClassStart: {
      style: "string",
      arms: [
        token("^]", "string", setState("regexClass")),
        token("]", "string", setState("regexClass")),
        token("^", "string", setState("regexClass")),
      ],
      otherwise: [setState("regexClass")],
    },
    regexClass: {
      style: "string",
      arms: [
        ...[":", ".", "="].map((mark) =>
          on(
            "[",
            literal("[" + mark),
            bytes(except(byteSet({ ranges: [[0, 255]] }), "\r\n" + mark)),
            literal(mark + "]"),
            paint("string"),
          ),
        ),
        escape,
        token("]", "string", popState()),
        redispatch("\n", popState()),
      ],
    },
  },
});
