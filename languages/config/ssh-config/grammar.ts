import {
  byte,
  bytes,
  byteSet,
  defineGrammar,
  except,
  literal,
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

const alpha = union(range("a", "z"), range("A", "Z"));
const name = union(alpha, range("0", "9"), "_");
const all = byteSet({ ranges: [[0, 255]] });
const wordEscape = on("\\", literal("\\"), byte("'\"\\ "), paint("string.escape"));
const quoteEscape = on("\\", literal("\\"), byte("'\"\\"), paint("string.escape"));
// Expansion support depends on the option; mark token shapes without resolving it.
const expansion = [
  on("%", literal("%"), byte(alpha), paint("string.escape")),
  token("%%", "string.escape"),
  on(
    "$",
    literal("${"),
    byte(union(alpha, "_")),
    bytes(name, { min: 0 }),
    literal("}"),
    paint("variable"),
  ),
];

// Directive names are highlighted syntactically, including unknown options;
// OpenSSH versions and client/server implementations recognize different sets.
export default defineGrammar({
  name: "ssh-config",
  aliases: ["ssh_config", "sshd_config"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("#", "comment", setState("comment")),
        on(
          alpha,
          bytes(name),
          notNext(except(all, " \t\r\n=")),
          paint("keyword"),
          setState("separator"),
        ),
        token("\n", "plain"),
      ],
      otherwise: [setState("tail")],
    },
    separator: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("=", "operator", setState("arguments")),
        token("\n", "plain", setState("root")),
      ],
      otherwise: [setState("arguments")],
    },
    arguments: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("#", "comment", setState("comment")),
        token("\n", "plain", setState("root")),
      ],
      otherwise: [setState("word")],
    },
    word: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain"), setState("arguments")),
        token('"', "string", pushState("quoted")),
        token("'", "string", pushState("singleQuoted")),
        ...expansion,
        wordEscape,
        token("\n", "plain", setState("root")),
      ],
    },
    quoted: {
      style: "string",
      arms: [
        ...expansion,
        quoteEscape,
        token('"', "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    singleQuoted: {
      style: "string",
      arms: [
        ...expansion,
        quoteEscape,
        token("'", "string", popState()),
        redispatch("\n", popState()),
      ],
    },
    tail: { style: "plain", arms: [token("\n", "plain", setState("root"))] },
    comment: { style: "comment", arms: [token("\n", "plain", setState("root"))] },
  },
});
