import {
  byte,
  bytes,
  choice,
  defineGrammar,
  lineEnd,
  literal,
  lookahead,
  on,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, range("0", "9"));
const expansion = [
  on(
    "$",
    literal("${"),
    byte(start),
    bytes(rest, { min: 0 }),
    choice([literal(":-")], [literal(":?")], [literal(":+")], [byte("-?+")]),
    paint("variable"),
    pushState("expansion"),
  ),
  on("$", literal("${"), byte(start), bytes(rest, { min: 0 }), literal("}"), paint("variable")),
  on("$", literal("$"), byte(start), bytes(rest, { min: 0 }), paint("variable")),
];

// Compose-style interpolation is lexical: malformed expansions are not diagnosed,
// and identifiers are restricted to ASCII shell-style names.
export default defineGrammar({
  name: "dotenv",
  aliases: ["env"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", setState("comment")),
        on("e", literal("export"), bytes(" \t"), lookahead(byte(start)), paint("keyword")),
        on(
          start,
          byte(start),
          bytes(rest, { min: 0 }),
          lookahead(bytes(" \t", { min: 0 }), literal("=")),
          paint("property"),
          setState("key"),
        ),
      ],
    },
    key: {
      style: "plain",
      arms: [token("=", "operator", setState("value")), token("\n", "plain", setState("root"))],
    },
    value: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain"), setState("valueSpace")),
        token('"', "string", setState("double")),
        token("'", "string", setState("single")),
        token("\n", "plain", setState("root")),
      ],
      otherwise: [setState("unquoted")],
    },
    valueSpace: {
      style: "plain",
      arms: [
        token("#", "comment", setState("comment")),
        token('"', "string", setState("double")),
        token("'", "string", setState("single")),
        token("\n", "plain", setState("root")),
      ],
      otherwise: [setState("unquoted")],
    },
    unquoted: {
      style: "string",
      arms: [
        on(" \t", bytes(" \t"), lookahead(byte("#")), paint("plain"), setState("tail")),
        on(" \t", bytes(" \t"), lookahead(byte("\r")), paint("plain")),
        on(" \t", bytes(" \t"), lineEnd(), paint("plain")),
        ...expansion,
        token("\r", "plain"),
        token("\n", "plain", setState("root")),
      ],
    },
    double: {
      style: "string",
      arms: [
        on("\\", literal("\\"), byte('\\"nrt'), paint("string.escape")),
        ...expansion,
        token('"', "string", setState("tail")),
      ],
    },
    single: {
      style: "string",
      arms: [token("\\'", "string.escape"), token("'", "string", setState("tail"))],
    },
    expansion: {
      style: "string",
      arms: [...expansion, token("}", "variable", popState())],
    },
    tail: {
      style: "plain",
      arms: [token("#", "comment", setState("comment")), token("\n", "plain", setState("root"))],
    },
    comment: { style: "comment", arms: [redispatch("\n", setState("root"))] },
  },
});
