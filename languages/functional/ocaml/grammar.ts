import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
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
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const lower = union("_", range("a", "z"), byteSet({ ranges: [[128, 255]] }));
const start = union(lower, range("A", "Z"));
const rest = union(start, digit, "'");
const ident = [byte(start), bytes(rest, { min: 0 })];
const quotedId = union("_", range("a", "z"), byteSet({ ranges: [[128, 255]] }));
const operator = "!$%&*+-./:<=>?@^|~#";
const keywords =
  "and as assert begin class constraint do done downto effect else end exception external for fun function functor if in include inherit initializer lazy let match method module mutable new nonrec object of open private rec sig struct then to try type val virtual when while with".split(
    " ",
  );
const words = [
  ...keywordTable(keywords, "keyword"),
  ...keywordTable(["true", "false"], "constant.builtin"),
];
const digits = (set: typeof digit) => [byte(set), bytes(union(set, "_"), { min: 0 })];
const hex = union(digit, range("a", "f"), range("A", "F"));
const escapeBody = choice(
  [byte("0123456789"), byte(digit), byte(digit)],
  [literal("x"), byte(hex), byte(hex)],
  [literal("o"), byte("01234567"), byte("01234567"), byte("01234567")],
  [literal("u{"), bytes(hex), literal("}")],
  [character()],
);
const charLiteral = [
  literal("'"),
  choice(
    [literal("\\"), escapeBody],
    [bytes("\r", { min: 0 }), literal("\n")],
    [notNext("'\\\r\n"), character()],
  ),
  literal("'"),
];
const escape = on("\\", literal("\\"), escapeBody, paint("string.escape"));
const rawStart = (style: "string" | "comment", head: string) =>
  on(
    "{",
    literal("{"),
    lookahead(bytes(quotedId, { min: 0 }), literal("|")),
    paint(style),
    shell.captureReset(),
    pushState(head),
  );

export default defineGrammar({
  name: "ocaml",
  aliases: ["ml", "mli"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          "#",
          lineStart(),
          literal("#"),
          bytes(except(all, "\r\n"), { min: 0 }),
          paint("comment"),
        ),
        token("(*", "comment", pushState("comment")),
        rawStart("string", "rawHead"),
        token('"', "string", pushState("string")),
        on("'", lookahead(...charLiteral), literal("'"), paint("string"), pushState("char")),
        on("'", literal("'"), byte(lower), bytes(rest, { min: 0 }), paint("variable")),
        ...["[@@@", "[@@", "[@", "[%%", "[%"].map((marker) =>
          token(marker, "punctuation.special", pushState("attribute")),
        ),
        on(
          "~?",
          byte("~?"),
          lookahead(byte(lower), bytes(rest, { min: 0 })),
          paint("punctuation.delimiter"),
          pushState("label"),
        ),
        on("`", literal("`"), ...ident, paint("type")),
        on(
          "0123456789",
          choice(
            [
              literal("0"),
              byte("xX"),
              ...digits(hex),
              optional(literal("."), bytes(union(hex, "_"), { min: 0 })),
              optional(byte("pP"), optional(byte("+-")), ...digits(digit)),
            ],
            [literal("0"), byte("oO"), ...digits("01234567")],
            [literal("0"), byte("bB"), ...digits("01")],
            [
              ...digits(digit),
              optional(literal("."), notNext("."), bytes(union(digit, "_"), { min: 0 })),
              optional(byte("eE"), optional(byte("+-")), ...digits(digit)),
            ],
          ),
          optional(byte("lLn")),
          notNext(rest),
          paint("number"),
        ),
        on("la", choice([literal("let")], [literal("and")]), bytes(operator), paint("keyword")),
        on(range("A", "Z"), ...ident, paint("type")),
        on(start, ...ident, classify(words, [paint("variable")])),
        on(
          operator,
          bytes(operator),
          classify(
            keywordTable(
              [".", ":", "=", "|", "->", ":>", ":=", "..", "+=", "~", "?"],
              "punctuation.delimiter",
            ),
            [paint("operator")],
          ),
        ),
        on("()[]{}", byte("()[]{}"), paint("punctuation.bracket")),
        on(",;", byte(",;"), paint("punctuation.delimiter")),
      ],
    },
    label: {
      style: "plain",
      arms: [on(lower, byte(lower), bytes(rest, { min: 0 }), paint("variable.member"), popState())],
    },
    attribute: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(start, ...ident, repeat(literal("."), ...ident), paint("attribute"), popState()),
      ],
      otherwise: [popState()],
    },
    comment: {
      style: "comment",
      arms: [
        token("(*", "comment", pushState("comment")),
        token("*)", "comment", popState()),
        token('"', "comment", pushState("commentString")),
        on("'", ...charLiteral, paint("comment")),
        rawStart("comment", "commentRawHead"),
      ],
    },
    commentString: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"', "comment", popState()),
      ],
    },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
    char: { style: "string", arms: [escape, token("'", "string", popState())] },
    rawHead: {
      style: "string",
      arms: [
        on(quotedId, bytes(quotedId), paint("string"), shell.captureAppend()),
        token("|", "string", setState("raw")),
      ],
    },
    raw: {
      style: "string",
      arms: [on("|", literal("|"), shell.captured(), literal("}"), paint("string"), popState())],
    },
    commentRawHead: {
      style: "comment",
      arms: [
        on(quotedId, bytes(quotedId), paint("comment"), shell.captureAppend()),
        token("|", "comment", setState("commentRaw")),
      ],
    },
    commentRaw: {
      style: "comment",
      arms: [on("|", literal("|"), shell.captured(), literal("}"), paint("comment"), popState())],
    },
  },
});
