import {
  byte,
  bytes,
  byteSet,
  classify,
  choice,
  defineGrammar,
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
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const first = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const nameByte = union(first, digit, "-");
const rest = union(nameByte, "?");
const name = [byte(first), bytes(nameByte, { min: 0 }), optional(literal("?"))];
const space = " \t\r\n";
const cases = [
  ...keywordTable(`true false nil null empty blank`.trim().split(/\s+/), "constant.builtin"),
  ...keywordTable(`contains and or in`.trim().split(/\s+/), "operator"),
];
const code = [
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
  on(
    union(digit, "-."),
    optional(literal("-")),
    choice([bytes(digit), optional(literal("."), bytes(digit))], [literal("."), bytes(digit)]),
    paint("number"),
  ),
  on(first, ...name, classify(cases, [paint("variable")])),
  token("|", "operator", pushState("filter")),
  token("..", "operator"),
  token(".", "punctuation.delimiter", pushState("member")),
  token(oneOf("()[]"), "punctuation.bracket"),
  ...["==", "!=", ">=", "<=", "=", ">", "<"].map((s) => token(s, "operator")),
  token(oneOf(",:"), "punctuation.delimiter"),
];
const specialOpen = (word: string, state: string) =>
  on(
    "{",
    literal("{%"),
    optional(literal("-")),
    lookahead(
      bytes(space, { min: 0 }),
      literal(word),
      notNext(rest),
      bytes(space, { min: 0 }),
      optional(literal("-")),
      literal("%}"),
    ),
    paint("punctuation.special"),
    pushState(state),
  );
const specialClose = (word: string) =>
  on(
    "{",
    literal("{%"),
    optional(literal("-")),
    bytes(space, { min: 0 }),
    literal(word),
    notNext(rest),
    bytes(space, { min: 0 }),
    optional(literal("-")),
    literal("%}"),
    paint("punctuation.special"),
    popState(),
  );

// Like Jinja and Twig, surrounding template text is plain rather than HTML.
export default defineGrammar<string>({
  name: "liquid",
  extensions: ["liquid"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        specialOpen("raw", "rawHeader"),
        specialOpen("comment", "commentHeader"),
        specialOpen("doc", "docHeader"),
        on(
          "{",
          literal("{{"),
          optional(literal("-")),
          paint("punctuation.special"),
          pushState("output"),
        ),
        on(
          "{",
          literal("{%"),
          optional(literal("-")),
          paint("punctuation.special"),
          pushState("tagHead"),
        ),
      ],
    },
    output: {
      style: "plain",
      arms: [
        token("-}}", "punctuation.special", popState()),
        token("}}", "punctuation.special", popState()),
        ...code,
      ],
    },
    tagHead: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on("l", literal("liquid"), notNext(rest), paint("keyword"), setState("liquidHead")),
        on("i", literal("include"), notNext(rest), paint("keyword"), setState("includeName")),
        token("#", "comment", setState("inlineComment")),
        on(first, ...name, paint("keyword"), setState("tag")),
      ],
      otherwise: [setState("tag")],
    },
    includeName: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on(first, ...name, literal(".html"), notNext(rest), paint("string"), setState("tag")),
      ],
      otherwise: [setState("tag")],
    },
    tag: {
      style: "plain",
      arms: [
        token("-%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
        ...code,
      ],
    },
    liquidHead: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        token("\n", "plain"),
        token("-%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
        token("#", "comment", setState("liquidComment")),
        on(
          "c",
          literal("comment"),
          notNext(rest),
          paint("keyword"),
          setState("liquid"),
          pushState("liquidBlockComment"),
        ),
        on("r", literal("raw"), notNext(rest), paint("keyword"), setState("liquidBlockRaw")),
        on(first, ...name, paint("keyword"), setState("liquid")),
      ],
      otherwise: [setState("liquid")],
    },
    liquid: {
      style: "plain",
      arms: [
        token("-%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
        token("\n", "plain", setState("liquidHead")),
        ...code,
      ],
    },
    liquidBlockComment: {
      style: "comment",
      arms: [token("\n", "comment", setState("liquidBlockCommentHead"))],
    },
    liquidBlockCommentHead: {
      style: "comment",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("comment")),
        on("e", literal("endcomment"), notNext(rest), paint("keyword"), popState()),
        on(
          "c",
          literal("comment"),
          notNext(rest),
          paint("comment"),
          pushState("liquidBlockComment"),
        ),
        token("\n", "comment"),
      ],
      otherwise: [setState("liquidBlockComment")],
    },
    liquidBlockRaw: {
      style: "plain",
      arms: [token("\n", "plain", setState("liquidBlockRawHead"))],
    },
    liquidBlockRawHead: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        on("e", literal("endraw"), notNext(rest), paint("keyword"), setState("liquid")),
        token("\n", "plain"),
      ],
      otherwise: [setState("liquidBlockRaw")],
    },
    inlineComment: {
      style: "comment",
      arms: [
        token("-%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
      ],
    },
    liquidComment: {
      style: "comment",
      arms: [
        token("\n", "plain", setState("liquidHead")),
        token("-%}", "punctuation.special", popState()),
        token("%}", "punctuation.special", popState()),
      ],
    },
    rawHeader: {
      style: "plain",
      arms: [
        on("r", literal("raw"), paint("keyword")),
        token("-%}", "punctuation.special", setState("raw")),
        token("%}", "punctuation.special", setState("raw")),
      ],
    },
    commentHeader: {
      style: "plain",
      arms: [
        on("c", literal("comment"), paint("keyword")),
        token("-%}", "punctuation.special", setState("comment")),
        token("%}", "punctuation.special", setState("comment")),
      ],
    },
    docHeader: {
      style: "plain",
      arms: [
        on("d", literal("doc"), paint("keyword")),
        token("-%}", "punctuation.special", setState("doc")),
        token("%}", "punctuation.special", setState("doc")),
      ],
    },
    doc: { style: "comment", arms: [specialClose("enddoc")] },
    raw: { style: "plain", arms: [specialClose("endraw")] },
    comment: {
      style: "comment",
      arms: [
        specialOpen("comment", "commentHeader"),
        specialOpen("raw", "commentRawHeader"),
        specialClose("endcomment"),
      ],
    },
    commentRawHeader: {
      style: "comment",
      arms: [
        on("r", literal("raw"), paint("comment")),
        token("-%}", "comment", setState("commentRaw")),
        token("%}", "comment", setState("commentRaw")),
      ],
    },
    commentRaw: { style: "comment", arms: [specialClose("endraw")] },
    filter: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        on(first, ...name, paint("function"), popState()),
      ],
      otherwise: [popState()],
    },
    member: {
      style: "plain",
      arms: [on(first, ...name, paint("variable.member"), popState())],
      otherwise: [popState()],
    },
    double: { style: "string", arms: [token('"', "string", popState())] },
    single: { style: "string", arms: [token("'", "string", popState())] },
  },
});
