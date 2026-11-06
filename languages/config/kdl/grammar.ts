import {
  byte,
  bytes,
  byteSet,
  choice,
  character,
  defineGrammar,
  except,
  literal,
  lookahead,
  matchRun,
  notLookahead,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  saveRun,
  setState,
  slot,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const unicodeHorizontal = choice(
  ...[
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u2001",
    "\u2002",
    "\u2003",
    "\u2004",
    "\u2005",
    "\u2006",
    "\u2007",
    "\u2008",
    "\u2009",
    "\u200a",
    "\u202f",
    "\u205f",
    "\u3000",
  ].map((text) => [literal(text)]),
);
const unicodeSpace = choice(
  [unicodeHorizontal],
  [literal("\u0085")],
  [literal("\u2028")],
  [literal("\u2029")],
);
const horizontal = choice([byte(" \t")], [unicodeHorizontal]);
const newline = choice(
  [literal("\r\n")],
  [byte("\r\n\v\f")],
  [literal("\u0085")],
  [literal("\u2028")],
  [literal("\u2029")],
);
// Invalid literal controls and Unicode direction controls are not diagnosed.
const ident = except(all, ' \t\r\n\v\f\\/(){};[]"#=\x00\x7f');
const identChar = [notLookahead(unicodeSpace), byte(ident)];
const rest = repeat(...identChar);
const first = except(ident, union(digit, "+-."));
const identifier = choice(
  [notLookahead(unicodeSpace), byte(first), rest],
  [byte("+-"), notLookahead(optional(literal(".")), byte(digit)), rest],
  [literal("."), notLookahead(byte(digit)), rest],
);
const endIdent = notLookahead(...identChar);
const newlineDispatch = union("\r\n\v\f", byteSet({ bytes: [0xc2, 0xe2] }));
const hashes = slot.run("raw-hashes");
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const skipStrings = [
  on(
    "#",
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("comment"),
    pushState("skipRawOpen"),
  ),
  on(
    "r",
    literal("r"),
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("comment"),
    pushState("skipRawOpen"),
  ),
  token('r"', "comment", pushState("skipRawV1")),
  token('"""', "comment", pushState("skipMultiline")),
  token('"', "comment", pushState("skipString")),
];
const skipSpace = on(
  union(" \t\r\n\v\f", byteSet({ bytes: [0xc2, 0xe1, 0xe2, 0xe3] })),
  choice([byte(" \t\r\n\v\f")], [unicodeSpace]),
  paint("comment"),
);
const entryStrings = (after: string) => [
  on(
    "#",
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("comment"),
    setState(after),
    pushState("skipRawOpen"),
  ),
  on(
    "r",
    literal("r"),
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("comment"),
    setState(after),
    pushState("skipRawOpen"),
  ),
  token('r"', "comment", setState(after), pushState("skipRawV1")),
  token('"""', "comment", setState(after), pushState("skipMultiline")),
  token('"', "comment", setState(after), pushState("skipString")),
];
const entryByte = except(all, " \t\r\n\v\f{};=");
const entryToken = (after: string) =>
  on(
    entryByte,
    notLookahead(unicodeSpace),
    byte(entryByte),
    repeat(notLookahead(unicodeSpace), byte(entryByte)),
    paint("comment"),
    setState(after),
  );
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte('"\\bfnrts')],
    [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
    [choice([horizontal], [newline]), repeat(choice([horizontal], [newline]))],
  ),
  paint("string.escape"),
);
const string = (after: string) => [
  on(
    "r",
    literal("r"),
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("string"),
    setState(after),
    pushState("rawOpen"),
  ),
  token('r"', "string", setState(after), pushState("rawV1")),
  on(
    "#",
    bytes("#"),
    lookahead(literal('"')),
    saveRun(hashes),
    paint("string"),
    setState(after),
    pushState("rawOpen"),
  ),
  token('"""', "string", setState(after), pushState("multiline")),
  token('"', "string", setState(after), pushState("string")),
];
const number = on(
  "+-0123456789",
  optional(byte("+-")),
  choice(
    [literal("0x"), byte(hex), bytes(union(hex, "_"), { min: 0 })],
    [literal("0o"), byte("01234567"), bytes("01234567_", { min: 0 })],
    [literal("0b"), byte("01"), bytes("01_", { min: 0 })],
    [
      byte(digit),
      bytes(union(digit, "_"), { min: 0 }),
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), byte(digit), bytes(union(digit, "_"), { min: 0 })),
    ],
  ),
  endIdent,
  paint("number"),
);
const values = [
  ...["#true", "#false", "#null", "#inf", "#-inf", "#nan"].map((word) =>
    on("#", literal(word), endIdent, paint("constant.builtin")),
  ),
  ...["true", "false", "null"].map((word) =>
    on(word[0]!, literal(word), endIdent, paint("constant.builtin")),
  ),
  number,
  ...string("node"),
  on(ident, identifier, paint("string")),
];
export default defineGrammar({
  name: "kdl",
  aliases: ["kdl2"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...comments,
        token("/-", "comment", pushState("skipNodeWait")),
        token("(", "punctuation.bracket", pushState("type")),
        ...string("node"),
        on(ident, identifier, paint("type"), setState("node")),
        token("}", "punctuation.bracket"),
        token(";", "punctuation.delimiter"),
      ],
    },
    node: {
      style: "plain",
      arms: [
        ...comments,
        token("/-", "comment", pushState("skipEntryWait")),
        on("\\", literal("\\"), repeat(horizontal), newline, paint("punctuation.special")),
        token("(", "punctuation.bracket", pushState("type")),
        token("{", "punctuation.bracket", setState("root")),
        token("}", "punctuation.bracket", setState("root")),
        token(";", "punctuation.delimiter", setState("root")),
        on(newlineDispatch, newline, paint("plain"), setState("root")),
        // Raw keys and comments between a key and '=' are not classified as properties.
        on(
          '"',
          literal('"'),
          repeat(
            choice([literal("\\"), character()], [notLookahead(newline), byte(except(all, '"\\'))]),
          ),
          literal('"'),
          lookahead(repeat(horizontal), literal("=")),
          paint("property"),
        ),
        on(ident, identifier, lookahead(repeat(horizontal), literal("=")), paint("property")),
        token("=", "operator"),
        ...values,
      ],
    },
    type: {
      style: "plain",
      arms: [
        ...comments,
        token(")", "punctuation.bracket", popState()),
        ...string("type"),
        on(ident, identifier, paint("type")),
      ],
    },
    skipNodeWait: {
      style: "comment",
      arms: [
        skipSpace,
        token("/*", "comment", pushState("blockComment")),
        token("//", "comment", pushState("skipLine")),
      ],
      otherwise: [setState("skipNode")],
    },
    skipNode: {
      style: "comment",
      arms: [
        ...skipStrings,
        token("/*", "comment", pushState("blockComment")),
        token("//", "comment", setState("skipNodeLine")),
        on("\\", literal("\\"), repeat(horizontal), newline, paint("comment")),
        token("{", "comment", pushState("skipBlock")),
        token(";", "comment", popState()),
        redispatch("}", popState()),
        on(newlineDispatch, newline, paint("comment"), popState()),
      ],
    },
    skipNodeLine: {
      style: "comment",
      arms: [on(newlineDispatch, newline, paint("comment"), popState())],
    },
    skipLine: {
      style: "comment",
      arms: [on(newlineDispatch, newline, paint("comment"), popState())],
    },
    skipBlock: {
      style: "comment",
      arms: [
        ...skipStrings,
        token("/*", "comment", pushState("blockComment")),
        token("//", "comment", pushState("skipLine")),
        token("{", "comment", pushState("skipBlock")),
        token("}", "comment", popState()),
      ],
    },
    skipEntryWait: {
      style: "comment",
      arms: [
        skipSpace,
        token("/*", "comment", pushState("blockComment")),
        token("//", "comment", pushState("skipLine")),
        token("{", "comment", setState("skipDone"), pushState("skipBlock")),
      ],
      otherwise: [setState("skipEntryStart")],
    },
    skipEntryStart: {
      style: "comment",
      arms: [
        token("(", "comment", pushState("skipType")),
        ...entryStrings("skipAfterEntry"),
        entryToken("skipAfterEntry"),
      ],
      otherwise: [popState()],
    },
    skipAfterEntry: {
      style: "comment",
      arms: [
        on(newlineDispatch, newline, paint("comment"), popState(), setState("root")),
        skipSpace,
        token("/*", "comment", pushState("blockComment")),
        token("=", "comment", setState("skipEntryValue")),
      ],
      otherwise: [popState()],
    },
    skipEntryValue: {
      style: "comment",
      arms: [
        skipSpace,
        token("/*", "comment", pushState("blockComment")),
        token("(", "comment", pushState("skipType")),
        ...entryStrings("skipDone"),
        entryToken("skipDone"),
      ],
      otherwise: [popState()],
    },
    skipDone: { style: "comment", arms: [], otherwise: [popState()] },
    skipType: { style: "comment", arms: [...skipStrings, token(")", "comment", popState())] },
    skipString: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"', "comment", popState()),
      ],
    },
    skipMultiline: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"""', "comment", popState()),
      ],
    },
    skipRawOpen: {
      style: "comment",
      arms: [
        token('"""', "comment", setState("skipRawMultiline")),
        token('"', "comment", setState("skipRaw")),
      ],
    },
    skipRaw: {
      style: "comment",
      arms: [
        on(
          '"',
          literal('"'),
          matchRun(hashes, { relation: "prefix" }),
          paint("comment"),
          popState(),
        ),
      ],
    },
    skipRawMultiline: {
      style: "comment",
      arms: [
        on(
          '"',
          literal('"""'),
          matchRun(hashes, { relation: "prefix" }),
          paint("comment"),
          popState(),
        ),
      ],
    },
    skipRawV1: { style: "comment", arms: [token('"', "comment", popState())] },
    lineComment: {
      style: "comment",
      arms: [on(newlineDispatch, newline, paint("plain"), popState(), setState("root"))],
    },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [
        escape,
        token('"', "string", popState()),
        on(newlineDispatch, newline, paint("plain"), popState(), setState("root")),
      ],
    },
    // Multiline delimiter indentation and the required opening newline are not validated.
    multiline: { style: "string", arms: [escape, token('"""', "string", popState())] },
    rawOpen: {
      style: "string",
      arms: [
        token('"""', "string", setState("rawMultiline")),
        token('"', "string", setState("raw")),
      ],
    },
    raw: {
      style: "string",
      arms: [
        on(
          '"',
          literal('"'),
          matchRun(hashes, { relation: "prefix" }),
          paint("string"),
          popState(),
        ),
        on(newlineDispatch, newline, paint("plain"), popState(), setState("root")),
      ],
    },
    rawV1: {
      style: "string",
      arms: [
        token('"', "string", popState()),
        on(newlineDispatch, newline, paint("plain"), popState(), setState("root")),
      ],
    },
    rawMultiline: {
      style: "string",
      arms: [
        on(
          '"',
          literal('"""'),
          matchRun(hashes, { relation: "prefix" }),
          paint("string"),
          popState(),
        ),
      ],
    },
  },
});
