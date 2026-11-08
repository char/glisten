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
const hex = union(range("0", "9"), range("a", "f"), range("A", "F"));
const separator = token(oneOf(":,"), "punctuation.delimiter");

const escape = on(
  "\\",
  literal("\\"),
  choice([byte('"\\/bfnrt')], [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)]),
  paint("string.escape"),
);
const number = [
  optional(literal("-")),
  choice([literal("0")], [byte(range("1", "9")), bytes(digit, { min: 0 })]),
  optional(literal("."), bytes(digit)),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
];
const constant = (word: string, finish: readonly Effect[]) =>
  on(
    word[0]!,
    previousNotIn(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n[{,:")),
    literal(word),
    notNext(except(byteSet({ ranges: [[0, 255]] }), " \t\r\n,]}")),
    paint("constant.builtin"),
    ...finish,
  );

/** Values other than strings; `finish` runs first, before any push. */
const values = ({ finish = [] }: { finish?: readonly Effect[] } = {}): Arm[] => [
  token("{", "punctuation.bracket", ...finish, pushState("objectKey")),
  token("[", "punctuation.bracket", ...finish, pushState("array")),
  on("-0123456789", ...number, paint("number"), ...finish),
  ...["true", "false", "null"].map((word) => constant(word, finish)),
];

export default defineGrammar({
  initial: "root",
  name: "json",
  extensions: [
    "json",
    "tfstate",
    "js.map",
    "mjs.map",
    "cjs.map",
    "jsx.map",
    "ts.map",
    "tsx.map",
    "css.map",
  ],
  filenames: ["flake.lock", "composer.lock", "Pipfile.lock", "deno.lock"],
  states: {
    root: {
      style: "plain",
      arms: [
        separator,
        token(oneOf("]}"), "punctuation.bracket"),
        token('"', "string", pushState("string")),
        ...values(),
      ],
    },
    objectKey: {
      style: "plain",
      arms: [
        token('"', "property", pushState("key")),
        token(":", "punctuation.delimiter", setState("objectValue")),
        token(",", "punctuation.delimiter"),
        token("}", "punctuation.bracket", popState()),
        ...values(),
      ],
    },
    objectValue: {
      style: "plain",
      arms: [
        token(",", "punctuation.delimiter", setState("objectKey")),
        token("}", "punctuation.bracket", popState()),
        token('"', "string", setState("objectKey"), pushState("string")),
        ...values({ finish: [setState("objectKey")] }),
      ],
    },
    array: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        separator,
        token('"', "string", pushState("string")),
        ...values(),
      ],
    },
    key: {
      style: "property",
      arms: [escape, token('"', "property", popState())],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState())],
    },
  },
});
