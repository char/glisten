import {
  byte,
  bytes,
  byteSet,
  cachedPrefix,
  character,
  defineGrammar,
  except,
  indentTo,
  literal,
  lookahead,
  notNext,
  on,
  paint,
  popState,
  pushState,
  redispatch,
  saveColumn,
  setState,
  slot,
  token,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const key = except(all, "=:\r\n");
const first = except(key, " \t;#[");
const escape = on("\\", literal("\\"), notNext("\r\n"), character(), paint("string.escape"));
const indent = slot.column("key-indent-plus-one");

// Full-line comments and Python-style indentation are selected where dialects
// disagree. A more-indented line continues the previous value, even if it
// contains an assignment; equal or lesser indentation begins a new entry.
// Tabs advance to four-column stops rather than configparser's character count.
export default defineGrammar({
  name: "ini",
  aliases: ["cfg", "gitconfig", "systemd", "desktop"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token(";", "comment", pushState("comment")),
        token("[", "punctuation.bracket", setState("section")),
        on(
          first,
          lookahead(cachedPrefix("key", first, key, byte("=:"))),
          character(),
          saveColumn(indent),
          paint("property"),
          setState("key"),
        ),
        token("\n", "plain"),
      ],
    },
    key: {
      style: "property",
      arms: [
        on(" \t", bytes(" \t"), lookahead(byte("=:")), paint("plain")),
        token("=", "operator", setState("value")),
        token(":", "operator", setState("value")),
      ],
    },
    section: {
      style: "type",
      arms: [
        token('"', "string", pushState("sectionQuote")),
        token("]", "punctuation.bracket", setState("tail")),
        token("\n", "plain", setState("root")),
      ],
    },
    sectionQuote: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    value: {
      style: "plain",
      arms: [
        escape,
        token('"', "string", pushState("quote")),
        token("'", "string", pushState("singleQuote")),
        token("\n", "plain", setState("afterValue")),
      ],
    },
    quote: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    singleQuote: {
      style: "string",
      arms: [token("'", "string", popState()), redispatch("\n", popState())],
    },
    afterValue: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), lookahead(byte("#;\r\n")), paint("plain")),
        token("#", "comment", pushState("comment")),
        token(";", "comment", pushState("comment")),
        token("\r", "plain"),
        token("\n", "plain"),
        on(" \t", indentTo(indent), paint("plain"), setState("continuation")),
      ],
      otherwise: [setState("root")],
    },
    continuation: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("#", "comment", pushState("comment")),
        token(";", "comment", pushState("comment")),
        token("\n", "plain", setState("afterValue")),
      ],
      otherwise: [setState("continuationText")],
    },
    continuationText: {
      style: "plain",
      arms: [token("\n", "plain", setState("afterValue"))],
    },
    tail: { style: "plain", arms: [token("\n", "plain", setState("root"))] },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
  },
});
