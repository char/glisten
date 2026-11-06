import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
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
  repeat,
  setState,
  shell,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const hexDigit = union(digit, range("a", "f"), range("A", "F"));
const hex = union(hexDigit, "_");
const dec = union(digit, "_");
const keywords =
  "abstract alias align asm assert auto body break case cast catch class const continue debug default delegate delete deprecated do else enum export extern final finally for foreach foreach_reverse function goto if immutable import in inout interface invariant is lazy macro mixin module new nothrow out override package pragma private protected public pure ref return scope shared static struct super switch synchronized template this throw try typeid typeof union unittest version volatile while with __gshared __traits __vector __parameters __FILE__ __LINE__ __MODULE__ __FUNCTION__ __PRETTY_FUNCTION__".split(
    " ",
  );
const types =
  "bool byte ubyte short ushort int uint long ulong cent ucent float double real ifloat idouble ireal cfloat cdouble creal char wchar dchar void string wstring dstring size_t ptrdiff_t".split(
    " ",
  );
const values = ["true", "false", "null"];
const words = [
  ...keywords.map((text) => ({ text, then: [paint("keyword")] })),
  ...types.map((text) => ({ text, then: [paint("type")] })),
  ...values.map((text) => ({ text, then: [paint("constant.builtin")] })),
];
const suffix = optional(byte("cwd"));
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [literal("&"), ...ident, literal(";")],
    ...(
      [
        ["x", 2],
        ["u", 4],
        ["U", 8],
      ] as const
    ).map(([prefix, count]) => [
      literal(prefix),
      ...Array.from({ length: count }, () => byte(hexDigit)),
    ]),
    [character()],
  ),
  paint("string.escape"),
);
const qstates: Record<string, State> = {};
const delimiters = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
] as const;
for (const [open, close] of delimiters) {
  const name = `delimited-${open.charCodeAt(0)}`;
  qstates[name] = {
    style: "string",
    arms: [
      token(open, "string", pushState(`${name}-nested`)),
      on(
        close,
        literal(close),
        literal('"'),
        suffix,
        paint("string"),
        shell.queueLeave(),
        popState(),
      ),
    ],
  };
  qstates[`${name}-nested`] = {
    style: "string",
    arms: [token(open, "string", pushState(`${name}-nested`)), token(close, "string", popState())],
  };
}
const operators = [
  ">>>=",
  "<<=",
  ">>=",
  "^^=",
  "...",
  "!<>=",
  "!<>",
  "!<=",
  "!>=",
  "<>=",
  "===",
  "!==",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "++",
  "--",
  "&&",
  "||",
  "^^",
  "<<",
  ">>>",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "~=",
  "..",
  "->",
];
const number: Arm = on(
  digit,
  choice(
    [
      literal("0"),
      byte("xX"),
      bytes(hex),
      optional(literal("."), bytes(hex, { min: 0 })),
      optional(byte("pP"), optional(byte("+-")), byte(digit), bytes(dec, { min: 0 })),
    ],
    [literal("0"), byte("bB"), bytes("01_")],
    [
      bytes(dec),
      optional(literal("."), notNext("."), bytes(dec, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), byte(digit), bytes(dec, { min: 0 })),
    ],
  ),
  bytes("uULfFi", { min: 0 }),
  paint("number"),
);
const code: Arm[] = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  token("/+", "comment", pushState("nestedComment")),
  token('q"', "string", shell.queueEnter(), pushState("delimitedStart")),
  token("q{", "string", pushState("tokenString")),
  token('r"', "string", pushState("rawString")),
  token('x"', "string", pushState("rawString")),
  token('"', "string", pushState("string")),
  token("`", "string", pushState("backtick")),
  token("'", "string", pushState("char")),
  on(
    "@",
    literal("@"),
    ...ident,
    classify(
      ["safe", "trusted", "system", "nogc", "property", "disable"].map((text) => ({
        text: `@${text}`,
        then: [paint("keyword")],
      })),
      [paint("attribute")],
    ),
  ),
  number,
  on(
    "s",
    literal("scope"),
    notNext(rest),
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    paint("keyword"),
    pushState("scopeOpen"),
  ),
  on(upper, ...ident, classify(words, [paint("type")])),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    classify(words, [paint("function")]),
  ),
  on(start, ...ident, classify(words, [paint("variable")])),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(",;"), "punctuation.delimiter"),
  ...operators.map((op) => token(op, "operator")),
  token(oneOf(".:"), "punctuation.delimiter"),
  on("!%&*+-/<=>?@^|~", byte("!%&*+-/<=>?@^|~"), paint("operator")),
];
const states: Record<string, State> = {
  ...qstates,
  start: {
    style: "plain",
    arms: [
      on(byteSet({ ranges: [[0xef, 0xef]] }), literal("\uFEFF"), paint("plain"), setState("root")),
    ],
    otherwise: [setState("root")],
  },
  root: { style: "plain", arms: code },
  scopeOpen: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      token("(", "punctuation.bracket", setState("scopeArg")),
    ],
    otherwise: [popState()],
  },
  scopeArg: {
    style: "plain",
    arms: [
      on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
      on(
        start,
        ...ident,
        classify(
          ["exit", "success", "failure"].map((text) => ({
            text,
            then: [paint("keyword"), popState()],
          })),
          [paint("variable"), popState()],
        ),
      ),
    ],
    otherwise: [popState()],
  },
  tokenString: {
    style: "plain",
    arms: [
      on("}", literal("}"), suffix, paint("string"), popState()),
      token("{", "punctuation.bracket", pushState("tokenNested")),
      ...code,
    ],
  },
  tokenNested: {
    style: "plain",
    arms: [
      token("}", "punctuation.bracket", popState()),
      token("{", "punctuation.bracket", pushState("tokenNested")),
      ...code,
    ],
  },
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
  nestedComment: {
    style: "comment",
    arms: [token("/+", "comment", pushState("nestedComment")), token("+/", "comment", popState())],
  },
  string: {
    style: "string",
    arms: [escape, on('"', literal('"'), suffix, paint("string"), popState())],
  },
  rawString: {
    style: "string",
    arms: [on('"', literal('"'), suffix, paint("string"), popState())],
  },
  backtick: { style: "string", arms: [on("`", literal("`"), suffix, paint("string"), popState())] },
  char: { style: "string", arms: [escape, token("'", "string", popState())] },
  delimitedStart: {
    style: "string",
    arms: [
      ...delimiters.map(([open]) =>
        token(open, "string", setState(`delimited-${open.charCodeAt(0)}`)),
      ),
      on(
        start,
        ...ident,
        lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), literal("\n")),
        paint("label"),
        shell.captureReset(),
        shell.captureAppend(),
        shell.queueSave(),
        setState("identifierDelimited"),
      ),
      on(
        all,
        character(),
        paint("string"),
        shell.captureReset(),
        shell.captureAppend(),
        shell.queueSave(),
        setState("dynamicDelimited"),
      ),
    ],
  },
  dynamicDelimited: {
    style: "string",
    arms: [
      on(
        all,
        shell.queueText(),
        literal('"'),
        suffix,
        paint("string"),
        shell.queueLeave(),
        popState(),
      ),
    ],
  },
  identifierDelimited: {
    style: "string",
    arms: [
      on(
        start,
        lineStart(),
        shell.queueText(),
        literal('"'),
        suffix,
        paint("label"),
        shell.queueLeave(),
        popState(),
      ),
    ],
  },
};
export default defineGrammar({ name: "d", aliases: ["dlang", "di"], initial: "start", states });
