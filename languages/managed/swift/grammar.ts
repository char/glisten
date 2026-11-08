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
  matchRun,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  previousNotIn,
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
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const gap = bytes(" \t\r\n", { min: 0 });
const hashes = slot.run("extendedHashes");
const keywords = `
  associatedtype class deinit enum extension fileprivate func import init inout internal let
  open operator private precedencegroup protocol public static struct subscript typealias var
  break case catch continue default defer do else fallthrough for guard if in repeat return
  switch throw where while as Any false is nil super self Self true try _
`
  .trim()
  .split(/\s+/);
const words = [
  { text: "func", then: [paint("keyword"), pushState("functionName")] },
  ...keywordTable(
    keywords.filter((x) => !["func", "true", "false", "nil"].includes(x)),
    "keyword",
  ),
  ...keywordTable(["true", "false", "nil"], "constant.builtin"),
];
const contextual = [
  ...`get set willSet didSet _read _modify`
    .trim()
    .split(/\s+/)
    .map((word) =>
      on(
        word[0]!,
        literal(word),
        notNext(rest),
        lookahead(
          gap,
          choice(
            [literal("{")],
            [literal("}")],
            [literal("("), gap, ...ident, gap, literal(")"), gap, literal("{")],
            [literal("async"), notNext(rest)],
            [literal("throws"), notNext(rest)],
          ),
        ),
        paint("keyword"),
      ),
    ),
  ...["some", "any"].map((word) =>
    on(
      word[0]!,
      literal(word),
      notNext(rest),
      lookahead(bytes(" \t"), byte(union(upper, "_"))),
      paint("keyword"),
    ),
  ),
  ...`
    actor mutating nonmutating override convenience lazy weak unowned nonisolated borrowing
    consuming isolated distributed final required
  `
    .trim()
    .split(/\s+/)
    .map((word) =>
      on(
        word[0]!,
        literal(word),
        notNext(rest),
        lookahead(bytes(" \t"), ...ident),
        paint("keyword"),
      ),
    ),
  ...`async await throws rethrows consume sending`
    .trim()
    .split(/\s+/)
    .map((word) =>
      on(
        word[0]!,
        literal(word),
        notNext(rest),
        lookahead(gap, choice([byte("{(")], [byte(start)], [literal("->")])),
        paint("keyword"),
      ),
    ),
];
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const number = on(
  digit,
  choice(
    [
      literal("0x"),
      bytes(union(hex, "_")),
      optional(literal("."), bytes(union(hex, "_"))),
      optional(byte("pP"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
    [literal("0b"), bytes("01_")],
    [literal("0o"), bytes("01234567_")],
    [
      bytes(union(digit, "_")),
      optional(literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
    ],
  ),
  paint("number"),
);
const code = [
  ...comments,
  on(
    "#",
    bytes("#"),
    lookahead(byte('"/')),
    saveRun(hashes),
    paint("string"),
    pushState("extendedOpen"),
  ),
  token('"""', "string", pushState("multiline")),
  token('"', "string", pushState("string")),
  // Bare slash regexes require a closing slash and a nonspace first byte; expression context is approximated.
  on(
    "/",
    previousNotIn(union(rest, ')]"')),
    literal("/"),
    notNext(" \t\r\n/*="),
    lookahead(
      repeat(choice([literal("\\"), character()], [byte(except(all, "/\\\r\n"))])),
      literal("/"),
    ),
    paint("string"),
    pushState("regex"),
  ),
  on("@", literal("@"), ...ident, paint("attribute")),
  on(
    "#",
    literal("#"),
    ...ident,
    classify(
      keywordTable(
        `#if #elseif #else #endif #available #unavailable #selector #keyPath`.trim().split(/\s+/),
        "keyword",
      ),
      [paint("punctuation.special")],
    ),
  ),
  on("$", literal("$"), bytes(digit), paint("variable")),
  on("`", literal("`"), ...ident, literal("`"), paint("variable")),
  number,
  ...contextual,
  on(start, ...ident, lookahead(gap, literal("(")), classify(words, [paint("function")])),
  on(upper, ...ident, classify(words, [paint("type")])),
  on(start, ...ident, classify(words, [paint("variable")])),
  token("(", "punctuation.bracket", pushState("paren")),
  token(oneOf("{}[]"), "punctuation.bracket"),
  token("...", "operator"),
  token("..<", "operator"),
  token(".", "punctuation.delimiter", pushState("field")),
  token(oneOf(",;:"), "punctuation.delimiter"),
  on("/=-+!*%<>&|^~?.", bytes("/=-+!*%<>&|^~?."), paint("operator")),
];
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
// Extended delimiter counts use a document-wide run slot; an extended literal nested inside
// interpolation overwrites its outer literal's count. Unicode identifier categories are approximated.
// Contextual words use local lookahead, not declaration or expression context: for example,
// `{ get set }` does not recognize `get`, and an identifier before `}` can be misclassified.
// Numeric underscore placement and escape validity are not checked.
export default defineGrammar({
  name: "swift",
  initial: "root",
  states: {
    root: { style: "plain", arms: code },
    paren: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...code] },
    interpolation: {
      style: "plain",
      arms: [token(")", "punctuation.special", popState()), ...code],
    },
    field: {
      style: "plain",
      arms: [
        on(start, ...ident, lookahead(gap, literal("(")), paint("function"), popState()),
        on(start, ...ident, paint("variable.member"), popState()),
      ],
      otherwise: [popState()],
    },
    functionName: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        ...comments,
        on(start, ...ident, paint("function"), popState()),
        on("/=-+!*%<>&|^~?.", bytes("/=-+!*%<>&|^~?."), paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [token("/*", "comment", pushState("blockComment")), token("*/", "comment", popState())],
    },
    string: {
      style: "string",
      arms: [
        token("\\(", "punctuation.special", pushState("interpolation")),
        escape,
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    multiline: {
      style: "string",
      arms: [
        token("\\(", "punctuation.special", pushState("interpolation")),
        escape,
        token('"""', "string", popState()),
      ],
    },
    extendedOpen: {
      style: "string",
      arms: [
        token('"""', "string", setState("extendedMultiline")),
        token('"', "string", setState("extendedString")),
        token("/", "string", setState("extendedRegex")),
      ],
    },
    extendedString: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          matchRun(hashes, { relation: "exact" }),
          literal("("),
          paint("punctuation.special"),
          pushState("interpolation"),
        ),
        on(
          "\\",
          literal("\\"),
          matchRun(hashes, { relation: "exact" }),
          character(),
          paint("string.escape"),
        ),
        on('"', literal('"'), matchRun(hashes, { relation: "exact" }), paint("string"), popState()),
        redispatch("\r\n", popState()),
      ],
    },
    extendedMultiline: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          matchRun(hashes, { relation: "exact" }),
          literal("("),
          paint("punctuation.special"),
          pushState("interpolation"),
        ),
        on(
          "\\",
          literal("\\"),
          matchRun(hashes, { relation: "exact" }),
          character(),
          paint("string.escape"),
        ),
        on(
          '"',
          literal('"""'),
          matchRun(hashes, { relation: "exact" }),
          paint("string"),
          popState(),
        ),
      ],
    },
    regex: {
      style: "string",
      arms: [
        escape,
        token("[", "string", pushState("regexClass")),
        token("/", "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    regexClass: { style: "string", arms: [escape, token("]", "string", popState())] },
    extendedRegex: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          matchRun(hashes, { relation: "exact" }),
          literal("("),
          paint("punctuation.special"),
          pushState("interpolation"),
        ),
        on("\\", literal("\\"), character(), paint("string.escape")),
        token("[", "string", pushState("extendedRegexClass")),
        on("/", literal("/"), matchRun(hashes, { relation: "exact" }), paint("string"), popState()),
      ],
    },
    extendedRegexClass: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token("]", "string", popState()),
      ],
    },
  },
});
