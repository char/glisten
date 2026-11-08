import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
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
  repeat,
  token,
  union,
  type Arm,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_$", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const word = (text: string) => [literal(text), notNext(rest)];
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const operators = "!%&*+-/:<=>?^|~";
const opPart = choice([byte(except(operators, "/"))], [literal("/"), notNext("/*")]);
const keywords = `
  abstract after alias anonymous apply auto bool break case catch constant constructor continue
  copyof default define delete do else emit enum error event external fallback false final for
  from function if immutable implements import in indexed inline interface internal is library let
  macro mapping match modifier mutable new null of override partial payable pragma private public
  pure receive relocatable return returns revert sealed sizeof solidity static storage struct
  supports switch this throw true try type typeof unchecked using var view virtual while memory
  calldata transient assembly
`
  .trim()
  .split(/\s+/);
const types = [
  "address",
  "bool",
  "string",
  "bytes",
  "byte",
  "int",
  "uint",
  "fixed",
  "ufixed",
  ...Array.from({ length: 32 }, (_, i) => `bytes${i + 1}`),
  ...Array.from({ length: 32 }, (_, i) => `uint${(i + 1) * 8}`),
  ...Array.from({ length: 32 }, (_, i) => `int${(i + 1) * 8}`),
];
const words = [
  ...keywordTable(
    keywords.filter((w) => !["true", "false", "null", "bool", "this"].includes(w)),
    "keyword",
  ),
  ...keywordTable(types, "type"),
  ...keywordTable(["true", "false"], "constant.builtin"),
  ...keywordTable(["msg", "block", "tx", "abi", "super", "this"], "constant.builtin"),
  ...keywordTable(
    ["wei", "gwei", "ether", "seconds", "minutes", "hours", "days", "weeks", "years"],
    "constant.builtin",
  ),
  ...keywordTable(
    `
      require assert keccak256 sha256 ripemd160 ecrecover addmod mulmod gasleft selfdestruct
      blockhash
    `
      .trim()
      .split(/\s+/),
    "function",
  ),
];
const yulKeywords = `
  let function if switch case default for break continue leave true false
`
  .trim()
  .split(/\s+/);
const yulBuiltins = `
  stop add sub mul div sdiv mod smod exp not lt gt slt sgt eq iszero and or xor byte shl shr sar
  addmod mulmod signextend keccak256 pop mload mstore mstore8 sload sstore tload tstore msize gas
  address balance selfbalance caller callvalue calldataload calldatasize calldatacopy codesize
  codecopy extcodesize extcodecopy returndatasize returndatacopy extcodehash create create2 call
  callcode delegatecall staticcall return revert selfdestruct invalid log0 log1 log2 log3 log4
  chainid origin gasprice blockhash coinbase timestamp number difficulty prevrandao gaslimit
  basefee blobbasefee blobhash pc datasize dataoffset datacopy setimmutable loadimmutable
  memoryguard
`
  .trim()
  .split(/\s+/);
const yulWords = [
  ...keywordTable(yulKeywords, "keyword"),
  ...keywordTable(yulBuiltins, "function"),
];
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("x"), bytes(hex, { min: 2, max: 2 })],
    [literal("u"), bytes(hex, { min: 4, max: 4 })],
    [character()],
  ),
  paint("string.escape"),
);
const comments: Arm[] = [
  token("///", "comment", pushState("docLine")),
  token("//", "comment", pushState("lineComment")),
  token("/**/", "comment"),
  token("/**", "comment", pushState("docBlock")),
  token("/*", "comment", pushState("blockComment")),
];
const strings: Arm[] = [
  on(
    "hu",
    choice([literal("hex")], [literal("unicode")]),
    lookahead(byte("\"'")),
    paint("string"),
    pushState("prefixedString"),
  ),
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [
      bytes(union(digit, "_")),
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
  paint("number"),
);
const punctuation: Arm[] = [
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;."), "punctuation.delimiter"),
  on(operators, opPart, repeat(opPart), paint("operator")),
];
const code: Arm[] = [
  ...comments,
  ...strings,
  number,
  on("a", ...word("assembly"), paint("keyword"), pushState("assemblyOpen")),
  ...["contract", "interface", "library", "struct", "enum"].map((w) =>
    on(w[0]!, ...word(w), paint("keyword"), pushState("typeName")),
  ),
  ...["function", "modifier", "event", "error"].map((w) =>
    on(w[0]!, ...word(w), paint("keyword"), pushState("functionName")),
  ),
  on(upper, ...ident, classify(words, [paint("type")])),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    classify(words, [paint("function")]),
  ),
  on(start, ...ident, classify(words, [paint("variable")])),
  token(".", "punctuation.delimiter", pushState("member")),
  ...punctuation,
];
const yul: Arm[] = [
  ...comments,
  ...strings,
  number,
  on(start, ...ident, classify(yulWords, [paint("variable")])),
  token(oneOf("()[]"), "punctuation.bracket"),
  token(oneOf(",;."), "punctuation.delimiter"),
  on(operators, opPart, repeat(opPart), paint("operator")),
];
const nameArms = (style: "type" | "function"): Arm[] => [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  ...comments,
  on(start, ...ident, paint(style), popState()),
];
const docTag = on("@", literal("@"), ...ident, paint("attribute"));

// Type names, call names and Yul builtin recognition are lexical rather than semantic.
export default defineGrammar({
  name: "solidity",
  aliases: ["sol"],
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    typeName: { style: "plain", arms: nameArms("type"), otherwise: [popState()] },
    member: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        on(
          start,
          ...ident,
          lookahead(bytes(" \t", { min: 0 }), literal("(")),
          paint("function"),
          popState(),
        ),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    functionName: { style: "plain", arms: nameArms("function"), otherwise: [popState()] },
    assemblyOpen: {
      style: "plain",
      arms: [
        token("{", "punctuation.bracket", popState(), pushState("yul")),
        ...comments,
        ...strings,
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        token(oneOf("()"), "punctuation.bracket"),
      ],
      otherwise: [popState()],
    },
    yul: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState()),
        token("{", "punctuation.bracket", pushState("yul")),
        ...yul,
      ],
    },
    prefixedString: {
      style: "string",
      arms: [
        token('"', "string", popState(), pushState("doubleString")),
        token("'", "string", popState(), pushState("singleString")),
      ],
    },
    doubleString: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    singleString: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\r\n", popState())],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    docLine: { style: "comment", arms: [docTag, redispatch("\r\n", popState())] },
    docBlock: { style: "comment", arms: [docTag, token("*/", "comment", popState())] },
  },
});
