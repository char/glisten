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
const keyword = (word: string, next: string) =>
  on(word[0]!, literal(word), notNext(name), paint("keyword"), setState(next));

export default defineGrammar({
  name: "ninja",
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
        token("\n", "plain", setState("root")),
      ],
    },
    ruleName: {
      style: "plain",
      arms: [
        on(name, bytes(name), paint("function"), setState("lineEnd")),
        token("\n", "plain", setState("root")),
      ],
    },
    poolName: {
      style: "plain",
      arms: [
        on(name, bytes(name), paint("type"), setState("lineEnd")),
        token("\n", "plain", setState("root")),
      ],
    },
    lineEnd: { style: "plain", arms: [token("\n", "plain", setState("root"))] },
    binding: {
      style: "plain",
      arms: [token("=", "operator", setState("value")), token("\n", "plain", setState("root"))],
    },
    value: { style: "string", arms: [...expansion, token("\n", "plain", setState("root"))] },
    buildOutputs: {
      style: "string",
      arms: [
        ...expansion,
        token(":", "punctuation.delimiter", setState("buildRule")),
        token("|", "operator"),
        on(" \r", bytes(" \r"), paint("plain")),
        token("\n", "plain", setState("root")),
      ],
    },
    buildRule: {
      style: "plain",
      arms: [
        on(name, bytes(name), paint("function"), setState("buildInputs")),
        token("\n", "plain", setState("root")),
      ],
    },
    buildInputs: {
      style: "string",
      arms: [
        ...expansion,
        token("||", "operator"),
        token("|@", "operator"),
        token("|", "operator"),
        on(" \r", bytes(" \r"), paint("plain")),
        token("\n", "plain", setState("root")),
      ],
    },
    paths: {
      style: "string",
      arms: [
        ...expansion,
        on(" \r", bytes(" \r"), paint("plain")),
        token("\n", "plain", setState("root")),
      ],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
  },
});
