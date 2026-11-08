import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  markRecord,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  patchRecord,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const lower = range("a", "z");
const upper = range("A", "Z");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union(lower, upper, "%");
const tail = union(lower, upper, digit, "_-");
const word = choice(
  [byte(lower), bytes(union(lower, digit), { min: 0 })],
  [byte(upper), bytes(union(upper, digit), { min: 0 })],
);
const ident = [
  previousNotIn(tail),
  optional(literal("%")),
  word,
  repeat(literal("-"), choice([word], [bytes(digit), optional(word)])),
  notNext(tail),
];
const part = union(lower, upper, digit, "-");
const semver = [
  bytes(digit),
  literal("."),
  bytes(digit),
  literal("."),
  bytes(digit),
  optional(literal("-"), bytes(part), repeat(literal("."), bytes(part))),
  optional(literal("+"), bytes(part), repeat(literal("."), bytes(part))),
];
const trivia = [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const escape = on(
  "\\",
  literal("\\"),
  choice([byte("tnr\"'\\")], [byte(hex), byte(hex)], [literal("u{"), bytes(hex), literal("}")]),
  paint("string.escape"),
);
const primitives = `
  u8 u16 u32 u64 s8 s16 s32 s64 f32 f64 bool char string list option result tuple borrow own
  future stream map
`
  .trim()
  .split(/\s+/);
const words = [
  ...["record", "resource"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("typeName")],
  })),
  ...["variant", "enum"].map((text) => ({ text, then: [paint("keyword"), pushState("caseName")] })),
  { text: "flags", then: [paint("keyword"), pushState("flagName")] },
  { text: "type", then: [paint("keyword"), pushState("aliasName")] },
  ...["world", "interface"].map((text) => ({
    text,
    then: [paint("keyword"), pushState("itemName")],
  })),
  { text: "package", then: [paint("keyword"), pushState("packagePath")] },
  { text: "use", then: [paint("keyword"), pushState("path")] },
  { text: "include", then: [paint("keyword"), pushState("includePath")] },
  ...keywordTable(["import", "export", "as", "with", "static", "async", "constructor"], "keyword"),
  { text: "func", then: [paint("keyword")] },
  ...keywordTable(primitives, "type"),
];

export default defineGrammar({
  name: "wit",
  aliases: ["wasm-interface"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...trivia,
        token('"', "string", pushState("string")),
        token("@", "punctuation.special", pushState("atName")),
        // Unqualified names outside type expressions are not resolved; world
        // import and export paths therefore use the generic variable style.
        on(
          first,
          ...ident,
          classify(words, [paint("variable"), markRecord(), pushState("afterIdentifier")]),
        ),
        on(digit, ...semver, paint("number")),
        on(digit, bytes(digit), paint("number")),
        token("->", "punctuation.delimiter", pushState("typeExpr")),
        token("<", "punctuation.bracket", pushState("typeArgs")),
        token(":", "punctuation.delimiter"),
        token(oneOf(";,./"), "punctuation.delimiter"),
        token(oneOf("{}()>"), "punctuation.bracket"),
        token("=", "operator"),
      ],
    },
    // A world import path can have a colon after its first identifier, like a field.
    afterIdentifier: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          ":",
          literal(":"),
          patchRecord("property"),
          paint("punctuation.delimiter"),
          setState("afterColon"),
        ),
      ],
      otherwise: [popState()],
    },
    afterColon: {
      style: "plain",
      arms: [
        ...trivia,
        on(
          "f",
          literal("func"),
          notNext(tail),
          patchRecord("function"),
          paint("keyword"),
          popState(),
        ),
        ...["static", "async"].map((word) =>
          on(word[0]!, literal(word), notNext(tail), paint("keyword")),
        ),
        on("i", literal("interface"), notNext(tail), paint("keyword"), popState()),
        on(first, ...ident, paint("type"), popState()),
      ],
      otherwise: [popState()],
    },
    aliasName: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("type"), setState("aliasEqual"))],
      otherwise: [popState()],
    },
    aliasEqual: {
      style: "plain",
      arms: [...trivia, token("=", "operator", setState("typeExpr"))],
      otherwise: [popState()],
    },
    typeExpr: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("type"), popState())],
      otherwise: [popState()],
    },
    typeArgs: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, paint("type")),
        on(digit, bytes(digit), paint("number")),
        token("<", "punctuation.bracket", pushState("typeArgs")),
        token(">", "punctuation.bracket", popState()),
        token(",", "punctuation.delimiter"),
      ],
    },
    caseName: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("type"), setState("caseOpen"))],
      otherwise: [popState()],
    },
    flagName: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("type"), setState("flagOpen"))],
      otherwise: [popState()],
    },
    caseOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("caseBody"))],
      otherwise: [popState()],
    },
    flagOpen: {
      style: "plain",
      arms: [...trivia, token("{", "punctuation.bracket", setState("flagBody"))],
      otherwise: [popState()],
    },
    caseBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        token("@", "punctuation.special", pushState("caseGate")),
        on(first, ...ident, paint("constant.builtin")),
        token(",", "punctuation.delimiter"),
        token("(", "punctuation.bracket", pushState("caseType")),
      ],
    },
    flagBody: {
      style: "plain",
      arms: [
        ...trivia,
        token("}", "punctuation.bracket", popState()),
        token("@", "punctuation.special", pushState("caseGate")),
        on(first, ...ident, paint("property")),
        token(",", "punctuation.delimiter"),
      ],
    },
    caseType: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, paint("type")),
        token("<", "punctuation.bracket", pushState("typeArgs")),
        token(")", "punctuation.bracket", popState()),
      ],
    },
    caseGate: {
      style: "plain",
      arms: [on(first, ...ident, paint("attribute"), setState("caseGateAfter"))],
      otherwise: [popState()],
    },
    caseGateAfter: {
      style: "plain",
      arms: [...trivia, token("(", "punctuation.bracket", setState("caseGateArgs"))],
      otherwise: [popState()],
    },
    caseGateArgs: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, paint("plain")),
        on(digit, ...semver, paint("number")),
        token("=", "operator"),
        token(")", "punctuation.bracket", popState()),
      ],
      otherwise: [popState()],
    },
    typeName: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("type"), popState())],
      otherwise: [popState()],
    },
    itemName: {
      style: "plain",
      arms: [...trivia, on(first, ...ident, paint("plain"), popState())],
      otherwise: [popState()],
    },
    packagePath: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, paint("plain")),
        token("@", "punctuation.delimiter"),
        on(digit, ...semver, paint("number")),
        token(oneOf(":/"), "punctuation.delimiter"),
        token(";", "punctuation.delimiter", popState()),
        token("{", "punctuation.bracket", popState()),
      ],
      otherwise: [popState()],
    },
    includePath: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, classify(keywordTable(["with", "as"], "keyword"), [paint("plain")])),
        token("@", "punctuation.delimiter"),
        on(digit, ...semver, paint("number")),
        token(oneOf(":/.,"), "punctuation.delimiter"),
        token("{", "punctuation.bracket", setState("includeNames")),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    includeNames: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, classify(keywordTable(["as"], "keyword"), [paint("plain")])),
        token(",", "punctuation.delimiter"),
        token("}", "punctuation.bracket", popState()),
      ],
      otherwise: [popState()],
    },
    path: {
      style: "plain",
      arms: [
        ...trivia,
        on(first, ...ident, classify(keywordTable(["as", "with"], "keyword"), [paint("plain")])),
        token("@", "punctuation.delimiter"),
        on(digit, ...semver, paint("number")),
        token(oneOf(":/.,"), "punctuation.delimiter"),
        token(oneOf("{}"), "punctuation.bracket"),
        token(";", "punctuation.delimiter", popState()),
      ],
      otherwise: [popState()],
    },
    atName: {
      style: "plain",
      arms: [
        on(digit, ...semver, paint("number"), popState()),
        on(first, ...ident, paint("attribute"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
  },
});
