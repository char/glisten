import {
  byte,
  bytes,
  byteSet,
  defineGrammar,
  except,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  shell,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const word = except(all, " \t\r\n");
const marker = union(range("a", "z"), range("A", "Z"), range("0", "9"), "_-");
const placeholderBody = except(all, "{} \t\r\n");
const placeholder = on("{", literal("{"), bytes(placeholderBody), literal("}"), paint("variable"));
const comment = token("#", "comment", pushState("comment"));
const continuation = on(
  "\\",
  literal("\\"),
  optional(literal("\r")),
  literal("\n"),
  paint("punctuation.special"),
);
const blockOpen = on(
  "{",
  literal("{"),
  notNext(word),
  paint("punctuation.bracket"),
  pushState("line"),
);
const blockClose = on("}", literal("}"), notNext(word), paint("punctuation.bracket"), popState());
const matcherName = on("@", literal("@"), bytes(except(word, "{}")), paint("tag"));
const heredoc = on(
  "<",
  literal("<<"),
  lookahead(bytes(marker), optional(literal("\r")), literal("\n")),
  shell.captureReset(),
  paint("label"),
  pushState("heredocMarker"),
);
const quoted = [
  token('"', "string", pushState("quoted")),
  token("`", "string", pushState("backtick")),
];

// Directive names are recognized lexically, including unknown subdirectives.
// Initial matcher-shaped arguments are highlighted as matchers even for directives
// that do not accept matchers. Standalone blocks do not validate nesting.
// Heredoc markers share the 256-byte capture limit; indentation is not validated.
export default defineGrammar({
  name: "caddy",
  extensions: ["caddy"],
  filenames: ["Caddyfile"],
  aliases: ["caddyfile"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        comment,
        continuation,
        on(
          "{",
          literal("{"),
          bytes(placeholderBody),
          literal("}"),
          paint("variable"),
          setState("siteWord"),
        ),
        blockOpen,
        on("i", literal("import"), notNext(word), paint("keyword"), setState("rootArgs")),
        on("(", literal("("), bytes(except(word, ")")), literal(")"), paint("label")),
        token('"', "string", setState("siteWord"), pushState("quoted")),
        token("`", "string", setState("siteWord"), pushState("backtick")),
        on(word, byte(word), paint("label"), setState("siteWord")),
      ],
    },
    siteWord: {
      style: "label",
      arms: [
        placeholder,
        token(",", "punctuation.delimiter", setState("siteComma")),
        redispatch(" \t\r\n", setState("siteHeader")),
      ],
    },
    siteHeader: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        token("\n", "plain", setState("line")),
        comment,
        continuation,
        on(
          "{",
          literal("{"),
          bytes(placeholderBody),
          literal("}"),
          paint("variable"),
          setState("siteWord"),
        ),
        on(
          "{",
          literal("{"),
          notNext(word),
          paint("punctuation.bracket"),
          setState("root"),
          pushState("line"),
        ),
        token(",", "punctuation.delimiter", setState("siteComma")),
        token('"', "string", setState("siteWord"), pushState("quoted")),
        token("`", "string", setState("siteWord"), pushState("backtick")),
        on(word, byte(word), paint("label"), setState("siteWord")),
      ],
    },
    siteComma: {
      style: "plain",
      arms: [on(" \t\r\n", bytes(" \t\r\n"), paint("plain")), comment, continuation],
      otherwise: [setState("siteHeader")],
    },
    rootArgs: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        comment,
        continuation,
        token("\n", "plain", setState("root")),
        ...quoted,
        placeholder,
        on(word, byte(word), paint("string"), setState("rootArgWord")),
      ],
    },
    rootArgWord: {
      style: "string",
      arms: [placeholder, redispatch(" \t\r\n", setState("rootArgs"))],
    },
    line: {
      style: "plain",
      arms: [
        on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
        comment,
        continuation,
        blockClose,
        blockOpen,
        on("@", literal("@"), bytes(except(word, "{}")), paint("tag"), setState("matcherDef")),
        on(word, bytes(word), paint("keyword"), setState("firstArgs")),
      ],
    },
    matcherDef: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        comment,
        continuation,
        token("\n", "plain", setState("line")),
        blockOpen,
        on(
          "{",
          literal("{"),
          bytes(placeholderBody),
          literal("}"),
          paint("variable"),
          setState("args"),
        ),
        token('"', "string", setState("args"), pushState("quoted")),
        token("`", "string", setState("args"), pushState("backtick")),
        on(word, bytes(word), paint("keyword"), setState("args")),
      ],
    },
    firstArgs: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        comment,
        continuation,
        token("\n", "plain", setState("line")),
        on("@", literal("@"), bytes(except(word, "{}")), paint("tag"), setState("args")),
        on("*", literal("*"), notNext(word), paint("tag"), setState("args")),
        on("/", literal("/"), paint("tag"), setState("matcherWord")),
      ],
      otherwise: [setState("args")],
    },
    matcherWord: {
      style: "tag",
      arms: [placeholder, redispatch(" \t\r\n", setState("args"))],
    },
    args: {
      style: "plain",
      arms: [
        on(" \t\r", bytes(" \t\r"), paint("plain")),
        token("\n", "plain", setState("line")),
        comment,
        continuation,
        placeholder,
        blockOpen,
        blockClose,
        heredoc,
        matcherName,
        ...quoted,
        on(word, byte(word), paint("string"), setState("argumentWord")),
      ],
    },
    argumentWord: {
      style: "string",
      arms: [placeholder, redispatch(" \t\r\n", setState("args"))],
    },
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    quoted: {
      style: "string",
      arms: [
        placeholder,
        on("\\", literal("\\"), byte('"'), paint("string.escape")),
        token('"', "string", popState()),
      ],
    },
    backtick: { style: "string", arms: [placeholder, token("`", "string", popState())] },
    heredocMarker: {
      style: "label",
      arms: [
        on(marker, bytes(marker), shell.captureAppend(), paint("label"), setState("heredocStart")),
      ],
    },
    heredocStart: { style: "plain", arms: [token("\n", "plain", setState("heredocBody"))] },
    heredocBody: {
      style: "string",
      arms: [
        on(
          union(" \t", marker),
          lineStart(),
          optional(bytes(" \t")),
          shell.captured(),
          optional(literal("\r")),
          lineEnd(),
          paint("label"),
          popState(),
        ),
        placeholder,
      ],
    },
  },
});
