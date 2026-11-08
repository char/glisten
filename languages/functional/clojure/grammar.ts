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

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const atom = except(all, " \t\r\n\f,()[]{}\";'`~@^\\");
const whitespace = " \t\r\n\f,";
const keywords = `
  def defonce defn defn- defmacro defmulti defmethod defprotocol defrecord deftype definterface
  defstruct fn fn* let let* letfn loop loop* recur if if-not if-let if-some when when-not when-let
  when-some do ns in-ns require import quote var throw try catch finally new set! monitor-enter
  monitor-exit case cond condp and or for doseq dotimes binding with-open with-redefs lazy-seq
  future comment assert declare gen-class reify proxy extend-type extend-protocol -> ->> some->
  some->> as-> doto ..
`
  .trim()
  .split(/\s+/);
const specialNumbers = ["##Inf", "##-Inf", "##NaN"];
const functionDefinitions = ["defn", "defn-", "defmacro"];
const comments = [token(";", "comment", pushState("lineComment"))];
const number = on(
  union(digit, "+-"),
  optional(byte("+-")),
  choice(
    [literal("0"), byte("xX"), bytes(hex), optional(byte("N"))],
    [bytes(digit), byte("rR"), bytes(union(digit, range("a", "z"), range("A", "Z")))],
    [bytes(digit), literal("/"), bytes(digit)],
    [
      bytes(digit),
      optional(literal("."), bytes(digit, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      optional(byte("MN")),
    ],
  ),
  notNext(atom),
  paint("number"),
);
const forms = [
  ...comments,
  token("#_", "comment", pushState("discardForm")),
  token('#"', "string", pushState("string")),
  token('"', "string", pushState("string")),
  on("\\", literal("\\"), choice([bytes(atom)], [character()]), paint("string.escape")),
  token("#{", "punctuation.bracket", pushState("curly")),
  token("#(", "punctuation.bracket", pushState("listHead")),
  token("#?@", "punctuation.special"),
  token("#?", "punctuation.special"),
  token("#'", "punctuation.special"),
  ...specialNumbers.map((value) => on("#", literal(value), notNext(atom), paint("number"))),
  on("#", literal("#"), bytes(atom), paint("punctuation.special")),
  token("(", "punctuation.bracket", pushState("listHead")),
  token("[", "punctuation.bracket", pushState("square")),
  token("{", "punctuation.bracket", pushState("curly")),
  token("~@", "punctuation.special"),
  token(oneOf("'`~@^"), "punctuation.special"),
  on(":", byte(":"), optional(byte(":")), bytes(atom), paint("constant.builtin")),
  number,
  on(
    atom,
    bytes(atom),
    classify(keywordTable(["nil", "true", "false"], "constant.builtin"), [paint("variable")]),
  ),
];
// Numeric syntax is lexical: radix bounds, zero denominators and suffix validity are not checked.
// Symbols and keywords are delimiter-based, without validating namespace or Unicode restrictions.
// Character names and string/regex escapes are colored without validating their spelling.
// List-head macro names are recognized by spelling, without namespace or shadowing resolution.
// Reader discards recognize balanced forms, prefixes and metadata, but do not evaluate reader conditionals or tagged readers.
export default defineGrammar({
  name: "clojure",
  extensions: ["clj", "cljs", "cljc", "edn", "bb", "cljx"],
  aliases: ["clj", "cljs", "cljc", "edn"],
  initial: "root",
  states: {
    root: { style: "plain", arms: forms },
    listHead: {
      style: "plain",
      arms: [
        on(whitespace, bytes(whitespace), paint("plain")),
        ...comments,
        token("#_", "comment", pushState("discardForm")),
        redispatch("#", setState("list")),
        on(
          ":",
          byte(":"),
          optional(byte(":")),
          bytes(atom),
          paint("constant.builtin"),
          setState("list"),
        ),
        on(union(digit, "+-"), ...number.match, paint("number"), setState("list")),
        on(
          atom,
          bytes(atom),
          classify(
            [
              ...functionDefinitions.map((text) => ({
                text,
                then: [paint("keyword"), setState("functionName")],
              })),
              ...keywords
                .filter((text) => !functionDefinitions.includes(text))
                .map((text) => ({ text, then: [paint("keyword"), setState("list")] })),
              ...["nil", "true", "false"].map((text) => ({
                text,
                then: [paint("constant.builtin"), setState("list")],
              })),
            ],
            [paint("function"), setState("list")],
          ),
        ),
        token(")", "punctuation.bracket", popState()),
      ],
      otherwise: [setState("list")],
    },
    functionName: {
      style: "plain",
      arms: [
        on(whitespace, bytes(whitespace), paint("plain")),
        ...comments,
        token("#_", "comment", pushState("discardForm")),
        token("^", "punctuation.special", pushState("nameMetadata")),
        on(atom, bytes(atom), paint("function"), setState("list")),
      ],
      otherwise: [setState("list")],
    },
    nameMetadata: {
      style: "plain",
      arms: [
        on(whitespace, bytes(whitespace), paint("plain")),
        ...comments,
        token("{", "punctuation.bracket", setState("nameMetadataDone"), pushState("curly")),
        on(":", byte(":"), optional(byte(":")), bytes(atom), paint("constant.builtin"), popState()),
        on(atom, bytes(atom), paint("type"), popState()),
        token('"', "string", setState("nameMetadataDone"), pushState("string")),
      ],
      otherwise: [popState()],
    },
    nameMetadataDone: { style: "plain", arms: [], otherwise: [popState()] },
    list: { style: "plain", arms: [token(")", "punctuation.bracket", popState()), ...forms] },
    square: { style: "plain", arms: [token("]", "punctuation.bracket", popState()), ...forms] },
    curly: { style: "plain", arms: [token("}", "punctuation.bracket", popState()), ...forms] },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    string: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    discardForm: {
      style: "comment",
      arms: [
        on(whitespace, bytes(whitespace), paint("comment")),
        token(";", "comment", pushState("discardLine")),
        token("#_", "comment", pushState("discardForm")),
        token("^", "comment", setState("discardMeta"), pushState("discardForm")),
        token("#?@", "comment"),
        token("#?", "comment"),
        token("#'", "comment"),
        token("~@", "comment"),
        token(oneOf("'`~@"), "comment"),
        token('#"', "comment", setState("discardString")),
        token('"', "comment", setState("discardString")),
        token("#{", "comment", setState("discardCurly")),
        token("#(", "comment", setState("discardList")),
        ...specialNumbers.map((value) =>
          on("#", literal(value), notNext(atom), paint("comment"), popState()),
        ),
        on("#", literal("#"), bytes(atom), paint("comment")),
        token("(", "comment", setState("discardList")),
        token("[", "comment", setState("discardSquare")),
        token("{", "comment", setState("discardCurly")),
        on("\\", literal("\\"), choice([bytes(atom)], [character()]), paint("comment"), popState()),
        on(atom, bytes(atom), paint("comment"), popState()),
        token(oneOf(")]}"), "comment", popState()),
      ],
      otherwise: [popState()],
    },
    discardMeta: { style: "comment", arms: [], otherwise: [setState("discardForm")] },
    discardLine: { style: "comment", arms: [redispatch("\r\n", popState())] },
    discardString: {
      style: "comment",
      arms: [
        on("\\", literal("\\"), character(), paint("comment")),
        token('"', "comment", popState()),
      ],
    },
    discardList: {
      style: "comment",
      arms: [
        token(")", "comment", popState()),
        redispatch(except(all, ")"), pushState("discardForm")),
      ],
    },
    discardSquare: {
      style: "comment",
      arms: [
        token("]", "comment", popState()),
        redispatch(except(all, "]"), pushState("discardForm")),
      ],
    },
    discardCurly: {
      style: "comment",
      arms: [
        token("}", "comment", popState()),
        redispatch(except(all, "}"), pushState("discardForm")),
      ],
    },
  },
});
