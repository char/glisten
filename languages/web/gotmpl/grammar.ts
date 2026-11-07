import {
  byte,
  byteSet,
  bytes,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  notLookahead,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const first = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(first, digit);
const name = [byte(first), bytes(rest, { min: 0 })];
const space = " \t\r\n";
const nonSpace = except(byteSet({ ranges: [[0, 255]] }), space);
const decimal = [byte(digit), repeat(optional(literal("_")), byte(digit))];
const hexDigits = [byte(hex), repeat(optional(literal("_")), byte(hex))];
const exponent = [byte("eE"), optional(byte("+-")), ...decimal];
const binaryExponent = [byte("pP"), optional(byte("+-")), ...decimal];
const number = (next: string) =>
  on(
    union(digit, ".", "+", "-"),
    optional(byte("+-")),
    choice(
      [
        literal("0"),
        byte("xX"),
        optional(literal("_")),
        ...hexDigits,
        optional(literal("."), optional(...hexDigits)),
        ...binaryExponent,
      ],
      [literal("0"), byte("xX"), literal("."), ...hexDigits, ...binaryExponent],
      [literal("0"), byte("xX"), optional(literal("_")), ...hexDigits],
      [literal("0"), byte("bB"), optional(literal("_")), bytes("01_")],
      [literal("0"), byte("oO"), optional(literal("_")), bytes("01234567_")],
      [...decimal, literal("."), optional(...decimal), optional(...exponent)],
      [...decimal, ...exponent],
      [literal("."), ...decimal, optional(...exponent)],
      [...decimal],
    ),
    optional(literal("i")),
    paint("number"),
    setState(next),
  );
const cases = [
  ...keywordTable(
    "if else end range with define template block break continue".split(" "),
    "keyword",
  ),
  ...keywordTable(["true", "false", "nil"], "constant.builtin"),
];
const argumentStart = union(first, digit, ".$(\"'`+-");
const code = (head: string, args: string, method: string, command: boolean) => [
  token('"', "string", setState(args), pushState("double")),
  token("'", "string", setState(args), pushState("char")),
  token("`", "string", setState(args), pushState("raw")),
  number(args),
  ...(command
    ? [
        on(
          first,
          ...name,
          lookahead(literal("."), byte(first)),
          classify(cases, [paint("function")]),
        ),
        on(
          "$",
          literal("$"),
          optional(...name),
          lookahead(literal("."), byte(first)),
          paint("variable"),
        ),
        on(
          ".",
          literal("."),
          ...name,
          lookahead(literal("."), byte(first)),
          paint("variable.member"),
        ),
        on(
          ".",
          literal("."),
          lookahead(...name, bytes(space), notLookahead(literal("-}}")), byte(argumentStart)),
          paint("variable.member"),
          pushState(method),
        ),
      ]
    : []),
  on("$", literal("$"), optional(...name), paint("variable"), setState(args)),
  on(".", literal("."), ...name, paint("variable.member"), setState(args)),
  token(".", "variable", setState(args)),
  on(first, ...name, classify(cases, [paint("function"), setState(args)])),
  token("(", "punctuation.bracket", pushState("parenHead")),
  token(":=", "operator", setState(head)),
  token("=", "operator", setState(head)),
  token("|", "operator", setState(head)),
  token(",", "punctuation.delimiter"),
];
const escape = (quote: string) =>
  on(
    "\\",
    literal("\\"),
    choice(
      [byte(union("abfnrtv\\", quote))],
      [literal("x"), byte(hex), byte(hex)],
      [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)],
      [
        literal("U"),
        byte(hex),
        byte(hex),
        byte(hex),
        byte(hex),
        byte(hex),
        byte(hex),
        byte(hex),
        byte(hex),
      ],
      [byte("01234567"), byte("01234567"), byte("01234567")],
    ),
    paint("string.escape"),
  );

// Template text is plain; composing it with HTML or YAML is future work.
// Identifier bytes and numeric separators are colored without Unicode or validity checks.
// Bare identifiers are functions except for keywords and constants, even in invalid actions.
// A command-head selector with following arguments is a method; niladic selectors
// remain members. After a parenthesized command head, an immediately following
// selector argument can be mistaken for a method on that result.
// An invalid comment ending before its delimiter remains a comment until a valid closer.
export default defineGrammar<string>({
  name: "gotmpl",
  aliases: ["go-template"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          "{",
          literal("{{"),
          optional(literal("-"), byte(space)),
          literal("/*"),
          paint("comment"),
          pushState("comment"),
        ),
        on(
          "{",
          literal("{{"),
          optional(literal("-"), lookahead(byte(space))),
          paint("punctuation.special"),
          pushState("actionHead"),
        ),
      ],
    },
    ...Object.fromEntries(
      (["action", "paren"] as const).flatMap((context) => {
        const head = `${context}Head`;
        const args = `${context}Args`;
        const method = `${context}Method`;
        const close =
          context === "action"
            ? [
                on(
                  "-",
                  previousNotIn(nonSpace),
                  literal("-}}"),
                  paint("punctuation.special"),
                  popState(),
                ),
                token("}}", "punctuation.special", popState()),
              ]
            : [token(")", "punctuation.bracket", popState())];
        return [
          [head, { style: "plain", arms: [...close, ...code(head, args, method, true)] }],
          [args, { style: "plain", arms: [...close, ...code(head, args, method, false)] }],
          [
            method,
            {
              style: "plain",
              arms: [on(first, ...name, paint("function"), popState(), setState(args))],
            },
          ],
        ];
      }),
    ),
    comment: {
      style: "comment",
      arms: [
        on(
          "*",
          literal("*/"),
          optional(byte(space), literal("-")),
          literal("}}"),
          paint("comment"),
          popState(),
        ),
      ],
    },
    double: { style: "string", arms: [escape('"'), token('"', "string", popState())] },
    char: { style: "string", arms: [escape("'"), token("'", "string", popState())] },
    raw: { style: "string", arms: [token("`", "string", popState())] },
  },
});
