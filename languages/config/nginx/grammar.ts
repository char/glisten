import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  literal,
  notNext,
  on,
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
const space = " \t\r\n";
const digit = range("0", "9");
const varName = union(range("a", "z"), range("A", "Z"), digit, "_");
const word = except(all, `${space};{`);
const start = except(word, "#}\"'");
// Variable interpretation is directive-dependent; use the HTTP script syntax
// everywhere, including its single-digit unbraced regex captures.
const variable = [
  on("$", literal("$"), byte("123456789"), paint("variable")),
  on("$", literal("${"), bytes(varName), literal("}"), paint("variable")),
  on("$", literal("$"), bytes(varName), paint("variable")),
];
// Backslash protects the next byte from tokenization, but nginx only decodes
// quotes, backslashes and the t/r/n escapes; other backslashes remain in the value.
const escape = on("\\", literal("\\"), character(), paint("string.escape"));
const comment = token("#", "comment", pushState("comment"));
const luaNames = `
  content_by_lua_block rewrite_by_lua_block access_by_lua_block header_filter_by_lua_block
  body_filter_by_lua_block log_by_lua_block init_by_lua_block init_worker_by_lua_block
  exit_worker_by_lua_block balancer_by_lua_block ssl_certificate_by_lua_block
  ssl_session_fetch_by_lua_block ssl_session_store_by_lua_block ssl_client_hello_by_lua_block
  set_by_lua_block
`
  .trim()
  .split(/\s+/);
const luaArms = () => [
  token("{", "plain", pushState("luaNested")),
  token('"', "plain", pushState("luaDouble")),
  token("'", "plain", pushState("luaSingle")),
  token("--", "plain", pushState("luaComment")),
];
// Numeric styling is lexical, not directive-specific: only whole decimal arguments
// with an optional single size/time suffix are recognized, not compound times.
const args = (block: string, wordState = "word") => [
  on(space, bytes(space), paint("plain")),
  comment,
  token(";", "punctuation.delimiter", setState("root")),
  token("{", "punctuation.bracket", setState(block)),
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
  on(
    "0123456789",
    bytes(digit),
    optional(choice([literal("ms")], [byte("kKmMgGywWdDhHsS")])),
    notNext(word),
    paint("number"),
  ),
  on(
    "=~^!",
    choice(
      [literal("~*")],
      [literal("^~")],
      [literal("!=")],
      [literal("!~*")],
      [literal("!~")],
      [byte("=~")],
    ),
    notNext(word),
    paint("operator"),
  ),
  redispatch(start, pushState(wordState)),
];

export default defineGrammar({
  name: "nginx",
  initial: "root",
  states: {
    // Block bodies share directive parsing, so unquoted map keys and MIME
    // types in types blocks are styled as directive keywords.
    root: {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        comment,
        token("}", "punctuation.bracket"),
        token('"', "string", setState("args"), pushState("double")),
        token("'", "string", setState("args"), pushState("single")),
        on(
          start,
          bytes(start),
          classify(
            [
              { text: "if", then: [paint("keyword"), setState("ifArgs")] },
              ...luaNames.map((name) => ({
                text: name,
                then: [paint("keyword"), setState("luaArgs")],
              })),
            ],
            [paint("keyword"), setState("args")],
          ),
        ),
      ],
    },
    args: { style: "plain", arms: args("root") },
    ifArgs: { style: "plain", arms: args("root", "ifWord") },
    luaArgs: { style: "plain", arms: args("lua") },
    word: {
      style: "plain",
      arms: [redispatch(`${space};{`, popState()), escape, ...variable],
    },
    // Parentheses in if arguments are marked visually, including those in an
    // unquoted regex; nginx itself treats them as part of the argument.
    ifWord: {
      style: "plain",
      arms: [
        redispatch(`${space};{`, popState()),
        escape,
        ...variable,
        token("(", "punctuation.bracket"),
        token(")", "punctuation.bracket"),
      ],
    },
    double: {
      style: "string",
      arms: [escape, ...variable, token('"', "string", popState())],
    },
    single: {
      style: "string",
      arms: [escape, ...variable, token("'", "string", popState())],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    // Embedded Lua is not parsed or injected. Brace balancing ignores Lua long
    // strings/comments, so their braces can end this block early or late.
    lua: {
      style: "plain",
      arms: [token("}", "punctuation.bracket", setState("root")), ...luaArms()],
    },
    luaNested: {
      style: "plain",
      arms: [token("}", "plain", popState()), ...luaArms()],
    },
    luaDouble: {
      style: "plain",
      arms: [on("\\", literal("\\"), character(), paint("plain")), token('"', "plain", popState())],
    },
    luaSingle: {
      style: "plain",
      arms: [on("\\", literal("\\"), character(), paint("plain")), token("'", "plain", popState())],
    },
    luaComment: { style: "plain", arms: [redispatch("\n", popState())] },
  },
});
