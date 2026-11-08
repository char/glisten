import {
  bytes,
  choice,
  defineGrammar,
  literal,
  lineStart,
  notNext,
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

const name = union(range("a", "z"), range("A", "Z"), range("0", "9"), "_.-");
const simpleName = union(range("a", "z"), range("A", "Z"), range("0", "9"), "_-");
const expansion = [
  on(
    "$",
    literal("$"),
    choice([literal("$")], [literal(" ")], [literal(":")], [literal("\r\n")], [literal("\n")]),
    paint("string.escape"),
  ),
  on("$", literal("${"), bytes(name), literal("}"), paint("variable")),
  on("$", literal("$"), bytes(simpleName), paint("variable")),
];
const keyword = (word: string, nextState: string) =>
  on(word[0]!, literal(word), notNext(name), paint("keyword"), setState(nextState));
const endLine = token("\n", "plain", setState("root"));

export default defineGrammar({
  name: "ninja",
  extensions: ["ninja"],
  aliases: ["build.ninja"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(" ", lineStart(), bytes(" "), paint("plain"), setState("bindingHead")),
        token("#", "comment", pushState("comment")),
        keyword("rule", "ruleName"),
        keyword("pool", "poolName"),
        keyword("build", "buildOutputs"),
        keyword("default", "paths"),
        keyword("include", "paths"),
        keyword("subninja", "paths"),
        on(name, bytes(name), paint("property"), setState("binding")),
      ],
    },
    // Indented bindings are highlighted without checking for a preceding rule, pool, or build.
    bindingHead: {
      style: "plain",
      arms: [
        on(name, bytes(name), paint("property"), setState("binding")),
        token("#", "comment", pushState("comment")),
        endLine,
      ],
    },
    ruleName: {
      style: "plain",
      arms: [on(name, bytes(name), paint("function"), setState("lineEnd")), endLine],
    },
    poolName: {
      style: "plain",
      arms: [on(name, bytes(name), paint("type"), setState("lineEnd")), endLine],
    },
    lineEnd: { style: "plain", arms: [endLine] },
    binding: {
      style: "plain",
      arms: [token("=", "operator", setState("value")), endLine],
    },
    value: { style: "string", arms: [...expansion, endLine] },
    buildOutputs: {
      style: "string",
      arms: [
        ...expansion,
        token(":", "punctuation.delimiter", setState("buildRule")),
        token("|", "operator"),
        on(" \r", bytes(" \r"), paint("plain")),
        endLine,
      ],
    },
    buildRule: {
      style: "plain",
      arms: [on(name, bytes(name), paint("function"), setState("buildInputs")), endLine],
    },
    buildInputs: {
      style: "string",
      arms: [
        ...expansion,
        token("||", "operator"),
        token("|@", "operator"),
        token("|", "operator"),
        on(" \r", bytes(" \r"), paint("plain")),
        endLine,
      ],
    },
    paths: {
      style: "string",
      arms: [...expansion, on(" \r", bytes(" \r"), paint("plain")), endLine],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
  },
});
