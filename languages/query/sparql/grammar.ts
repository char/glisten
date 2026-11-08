import {
  byte,
  byteSet,
  bytes,
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
  previousNotIn,
  pushState,
  range,
  redispatch,
  repeat,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
// Non-ASCII bytes are accepted in names without checking SPARQL's Unicode ranges.
const asciiLetter = union(range("a", "z"), range("A", "Z"));
const base = union(asciiLetter, byteSet({ ranges: [[128, 255]] }));
const pnU = union(base, "_");
const pn = union(pnU, digit, "-");
const varRest = union(pnU, digit);
const escapeName = choice(
  [literal("%"), byte(hex), byte(hex)],
  [literal("\\"), byte("_~.-!$&'()*+,;=/?#@%")],
);
const localFirst = choice([byte(union(pnU, digit, ":"))], [escapeName]);
const localTail = choice(
  [byte(union(pn, ":"))],
  [escapeName],
  [literal("."), lookahead(bytes(".", { min: 0 }), choice([byte(union(pn, ":"))], [escapeName]))],
);
const prefixed = [
  optional(byte(base), bytes(union(pn, "."), { min: 0 }), previousNotIn(".")),
  literal(":"),
  optional(localFirst, repeat(localTail)),
];
const exp = [byte("eE"), optional(byte("+-")), bytes(digit)];
const uchar = choice(
  [literal("\\u"), byte(hex), byte(hex), byte(hex), byte(hex)],
  [
    literal("\\U"),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
    byte(hex),
  ],
);
const iriChar = except(
  byteSet({ ranges: [[0, 255]] }),
  byteSet({ ranges: [[0, 32]], bytes: [...new TextEncoder().encode('<>"{}|^`\\')] }),
);
const iri = [literal("<"), repeat(choice([byte(iriChar)], [uchar])), literal(">")];
const keywords = `
  base prefix select distinct reduced as construct describe ask from named where order by asc
  desc limit offset group having values undef optional graph service silent bind union minus
  filter not exists in load clear drop create add move copy to insert data delete with using
  default all into where separator
`
  .trim()
  .split(/\s+/);
const builtins = `
  str lang langmatches datatype bound iri uri bnode rand abs ceil floor round concat substr
  strlen replace ucase lcase encode_for_uri contains strstarts strends strbefore strafter year
  month day hours minutes seconds timezone tz now uuid struuid md5 sha1 sha256 sha384 sha512
  coalesce if strlang strdt sameterm isiri isuri isblank isliteral isnumeric regex count sum
  min max avg sample group_concat
`
  .trim()
  .split(/\s+/);
const cases = [
  ...keywordTable([...new Set(keywords)], "keyword"),
  ...keywordTable(builtins, "function"),
];
const stringEscape = on(
  "\\",
  choice([uchar], [literal("\\"), byte("tbnrf\\\"'")]),
  paint("string.escape"),
);

export default defineGrammar({
  name: "sparql",
  extensions: ["rq", "sparql"],
  aliases: ["rq"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token('"""', "string", pushState("longDouble")),
        token("'''", "string", pushState("longSingle")),
        token('"', "string", pushState("double")),
        token("'", "string", pushState("single")),
        // Call lookahead does not cross intervening comments.
        on("<", ...iri, lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")), paint("function")),
        on("<", ...iri, paint("text.uri")),
        on("?$", byte("?$"), byte(varRest), bytes(varRest, { min: 0 }), paint("variable")),
        on(
          "_",
          literal("_:"),
          byte(union(pnU, digit)),
          repeat(choice([byte(pn)], [literal("."), lookahead(bytes(".", { min: 0 }), byte(pn))])),
          paint("constant.builtin"),
        ),
        on(
          union(base, ":"),
          ...prefixed,
          lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
          paint("function"),
        ),
        on(union(base, ":"), ...prefixed, paint("constant.builtin")),
        on(
          "@",
          literal("@"),
          bytes(asciiLetter),
          repeat(literal("-"), bytes(union(asciiLetter, digit))),
          paint("attribute"),
        ),
        // Signs are part of SPARQL numeric tokens; unary operators without digits remain operators.
        on(
          "+-0123456789.",
          optional(byte("+-")),
          choice(
            [bytes(digit), literal("."), bytes(digit, { min: 0 }), ...exp],
            [literal("."), bytes(digit), ...exp],
            [bytes(digit), ...exp],
            [bytes(digit), literal("."), bytes(digit)],
            [literal("."), bytes(digit)],
            [bytes(digit)],
          ),
          paint("number"),
        ),
        // The predicate shorthand and Boolean literals are case-sensitive, unlike keywords.
        ...["a", "true", "false"].map((text) =>
          on(
            text[0]!,
            literal(text),
            notNext(union(base, digit, "_")),
            paint(text === "a" ? "keyword" : "constant.builtin"),
          ),
        ),
        on(
          base,
          byte(base),
          bytes(union(base, digit, "_"), { min: 0 }),
          classify(cases, [paint("plain")], { caseless: true }),
        ),
        ...["^^", "!=", "<=", ">=", "&&", "||"].map((s) => token(s, "operator")),
        token(oneOf("=<>!+-*/|^?"), "operator"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
        token(oneOf(".,;"), "punctuation.delimiter"),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    double: {
      style: "string",
      arms: [stringEscape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    single: {
      style: "string",
      arms: [stringEscape, token("'", "string", popState()), redispatch("\r\n", popState())],
    },
    longDouble: { style: "string", arms: [stringEscape, token('"""', "string", popState())] },
    longSingle: { style: "string", arms: [stringEscape, token("'''", "string", popState())] },
  },
});
