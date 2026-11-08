import {
  type Arm,
  byte,
  bytes,
  byteSet,
  choice,
  defineGrammar,
  type Effect,
  except,
  literal,
  lookahead,
  repeat,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const alpha = union(range("a", "z"), range("A", "Z"));
const hex = union(digit, range("a", "f"), range("A", "F"));
const identStart = union(alpha, "_$");
const ident = union(identStart, digit);
const all = byteSet({ ranges: [[0, 255]] });
const separator = token(oneOf(":,"), "punctuation.delimiter");

const escape = on(
  "\\",
  literal("\\"),
  choice([byte(`"'\\/bfnrt`)], [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)]),
  paint("string.escape"),
);
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const trivia = repeat(
  choice(
    [bytes(" \t\r\n")],
    [literal("//"), bytes(except(all, "\r\n"), { min: 0 })],
    [
      literal("/*"),
      repeat(choice([byte(except(all, "*"))], [literal("*"), notNext("/")])),
      literal("*/"),
    ],
  ),
);
const quotedRootKey = (quote: string, state: string) =>
  on(
    quote,
    lookahead(
      literal(quote),
      repeat(choice([literal("\\"), byte(all)], [byte(except(all, quote + "\\"))])),
      literal(quote),
      trivia,
      literal(":"),
    ),
    literal(quote),
    paint("property"),
    setState("objectKey"),
    pushState(state),
  );
const bareKey = on(identStart, byte(identStart), bytes(ident, { min: 0 }), paint("property"));
const number = [
  optional(literal("-")),
  choice([literal("0")], [byte(range("1", "9")), bytes(digit, { min: 0 })]),
  optional(literal("."), bytes(digit)),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
];
const constant = (word: string, finish: readonly Effect[]) =>
  on(
    word[0]!,
    previousNotIn(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n[{,:/")),
    literal(word),
    notNext(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n,]}/")),
    paint("constant.builtin"),
    ...finish,
  );
const values = ({ finish = [] }: { finish?: readonly Effect[] } = {}): Arm[] => [
  token("{", "punctuation.bracket", ...finish, pushState("objectKey")),
  token("[", "punctuation.bracket", ...finish, pushState("array")),
  on("-0123456789", ...number, paint("number"), ...finish),
  ...["true", "false", "null"].map((word) => constant(word, finish)),
];

export default defineGrammar({
  initial: "root",
  name: "fjson",
  extensions: ["fjson", "jsonc"],
  filenames: ["avril.conf", "avril.lock", "tsconfig.json", "jsconfig.json", "deno.json"],
  aliases: ["jsonc"],
  states: {
    root: {
      style: "plain",
      arms: [
        ...comments,
        quotedRootKey('"', "key"),
        quotedRootKey("'", "singleKey"),
        on(
          identStart,
          lookahead(byte(identStart), bytes(ident, { min: 0 }), trivia, literal(":")),
          byte(identStart),
          bytes(ident, { min: 0 }),
          paint("property"),
          setState("objectKey"),
        ),
        separator,
        token(oneOf("]}"), "punctuation.bracket"),
        token('"', "string", pushState("string")),
        token("'", "string", pushState("singleString")),
        ...values(),
      ],
    },
    objectKey: {
      style: "plain",
      arms: [
        ...comments,
        token('"', "property", pushState("key")),
        token("'", "property", pushState("singleKey")),
        bareKey,
        token(":", "punctuation.delimiter", setState("objectValue")),
        token(",", "punctuation.delimiter"),
        token("}", "punctuation.bracket", popState()),
        ...values(),
      ],
    },
    objectValue: {
      style: "plain",
      arms: [
        ...comments,
        token(",", "punctuation.delimiter", setState("objectKey")),
        token("}", "punctuation.bracket", popState()),
        token('"', "string", setState("objectKey"), pushState("string")),
        token("'", "string", setState("objectKey"), pushState("singleString")),
        ...values({ finish: [setState("objectKey")] }),
      ],
    },
    array: {
      style: "plain",
      arms: [
        ...comments,
        token("]", "punctuation.bracket", popState()),
        separator,
        token('"', "string", pushState("string")),
        token("'", "string", pushState("singleString")),
        ...values(),
      ],
    },
    lineComment: { style: "comment", arms: [token(oneOf("\r\n"), "plain", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    singleKey: { style: "property", arms: [escape, token("'", "property", popState())] },
    singleString: { style: "string", arms: [escape, token("'", "string", popState())] },
    key: { style: "property", arms: [escape, token('"', "property", popState())] },
    string: { style: "string", arms: [escape, token('"', "string", popState())] },
  },
});
