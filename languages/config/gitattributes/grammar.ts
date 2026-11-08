import {
  byte,
  bytes,
  byteSet,
  defineGrammar,
  except,
  literal,
  on,
  paint,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const word = except(all, " \t\r\n");
const nameStart = union(range("a", "z"), range("A", "Z"), range("0", "9"), "_.");
const nameRest = union(nameStart, "-");

export default defineGrammar({
  name: "gitattributes",
  extensions: ["gitattributes"],
  filenames: [".gitattributes"],
  aliases: [".gitattributes"],
  initial: "line",
  states: {
    line: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("\n", "plain"),
        token("#", "comment", setState("comment")),
        token("[attr]", "keyword", setState("macro")),
        token('"', "string", setState("quoted")),
        token("!", "error", setState("pattern")),
        redispatch(word, setState("pattern")),
      ],
    },
    macro: {
      style: "plain",
      arms: [
        on(
          nameStart,
          byte(nameStart),
          bytes(nameRest, { min: 0 }),
          paint("property"),
          setState("attributes"),
        ),
      ],
      otherwise: [setState("pattern")],
    },
    pattern: {
      style: "plain",
      arms: [
        redispatch(" \t\r\n", setState("attributes")),
        on("\\", literal("\\"), byte(word), paint("string.escape")),
        // Escaped closing brackets and POSIX character classes are painted only up to
        // their first closing bracket; Git's wildcard matcher handles their full meaning.
        on(
          "[",
          literal("["),
          bytes(except(all, "] \t\r\n"), { min: 0 }),
          literal("]"),
          paint("string"),
        ),
        token("*", "string"),
        token("?", "string"),
        token("/", "string"),
      ],
    },
    quoted: {
      style: "plain",
      arms: [
        on(
          "\\",
          literal("\\"),
          byte("0123"),
          byte("01234567"),
          byte("01234567"),
          paint("string.escape"),
        ),
        on("\\", literal("\\"), byte('abfnrtv\\"'), paint("string.escape")),
        token("\\", "error"),
        token("/", "string"),
        token('"', "string", setState("attributes")),
        redispatch("\r\n", setState("line")),
      ],
    },
    attributes: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("line")),
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        token("-", "operator", setState("attributeName")),
        token("!", "operator", setState("attributeName")),
        on(
          nameStart,
          byte(nameStart),
          bytes(nameRest, { min: 0 }),
          paint("attribute"),
          setState("afterName"),
        ),
        on(word, bytes(word), paint("error")),
      ],
    },
    attributeName: {
      style: "plain",
      arms: [
        on(
          nameStart,
          byte(nameStart),
          bytes(nameRest, { min: 0 }),
          paint("attribute"),
          setState("afterName"),
        ),
      ],
      otherwise: [setState("attributes")],
    },
    afterName: {
      style: "plain",
      arms: [token("=", "operator", setState("value"))],
      otherwise: [setState("attributes")],
    },
    value: {
      style: "string",
      arms: [redispatch(" \t\r\n", setState("attributes"))],
    },
    comment: { style: "comment", arms: [token("\n", "plain", setState("line"))] },
  },
});
