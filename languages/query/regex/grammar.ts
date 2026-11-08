import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  defineGrammar,
  except,
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
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const letters = union(range("a", "z"), range("A", "Z"));
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte("pP"), literal("{"), bytes(union(letters, digit, "_=")), literal("}")],
    [literal("u{"), bytes(hex), literal("}")],
    [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)],
    [literal("x"), byte(hex), byte(hex)],
    [literal("c"), byte(letters)],
    [literal("k<"), bytes(except(byteSet({ ranges: [[0, 255]] }), ">\r\n")), literal(">")],
    [bytes(digit)],
    [character()],
  ),
  paint("string.escape"),
);
const counted = on(
  "{",
  literal("{"),
  lookahead(bytes(digit), optional(literal(","), bytes(digit, { min: 0 })), literal("}")),
  paint("punctuation.bracket"),
  pushState("count"),
);
const pattern = [
  escape,
  token("(?", "punctuation.bracket", pushState("groupHead")),
  token("(", "punctuation.bracket", pushState("group")),
  token("[", "punctuation.bracket", pushState("classFirst")),
  counted,
  token("^", "string.escape"),
  token("$", "string.escape"),
  token("|", "operator"),
  token("*", "operator"),
  token("+", "operator"),
  token("?", "operator"),
  token(".", "operator"),
];
const classArms = [
  token("\\q{", "string.escape", pushState("classString")),
  escape,
  token("[", "punctuation.bracket", pushState("classFirst")),
  token("]", "punctuation.bracket", popState()),
  token("&&", "operator"),
  token("--", "operator"),
  on("-", literal("-"), notNext("]"), paint("operator")),
];

// A bare pattern has no flags. Nested brackets use v-mode class syntax even
// when a legacy pattern intended an unescaped literal opening bracket.
export default defineGrammar({
  name: "regex",
  extensions: ["regex", "regexp"],
  initial: "root",
  states: {
    root: { style: "string", arms: pattern },
    group: { style: "string", arms: [token(")", "punctuation.bracket", popState()), ...pattern] },
    groupHead: {
      style: "string",
      arms: [
        token("<=", "operator", setState("group")),
        token("<!", "operator", setState("group")),
        token("=", "operator", setState("group")),
        token("!", "operator", setState("group")),
        token(":", "punctuation.bracket", setState("group")),
        token("<", "punctuation.bracket", setState("groupName")),
        on("ims", bytes("ims"), paint("keyword"), setState("groupFlags")),
        token("-", "operator", setState("groupFlags")),
      ],
      otherwise: [setState("group")],
    },
    groupFlags: {
      style: "string",
      arms: [
        on("ims", bytes("ims"), paint("keyword")),
        token("-", "operator"),
        token(":", "punctuation.delimiter", setState("group")),
      ],
      otherwise: [setState("group")],
    },
    groupName: {
      style: "property",
      arms: [token(">", "punctuation.bracket", setState("group"))],
    },
    classFirst: {
      style: "string",
      arms: [
        token("^", "operator", setState("class")),
        token("-", "string", setState("class")),
        redispatch("]", setState("class")),
      ],
      otherwise: [setState("class")],
    },
    class: { style: "string", arms: classArms },
    classString: {
      style: "string",
      arms: [escape, token("|", "operator"), token("}", "string.escape", popState())],
    },
    count: {
      style: "string",
      arms: [
        on(digit, bytes(digit), paint("number")),
        token(",", "punctuation.delimiter"),
        token("}", "punctuation.bracket", popState()),
      ],
      otherwise: [popState()],
    },
  },
});
