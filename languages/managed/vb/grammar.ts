import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  lineEnd,
  literal,
  lookahead,
  notNext,
  notLookahead,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"), byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), repeat(notLookahead(literal("’")), byte(rest))];
const digits = union(digit, "_");
const hex = union(digits, range("a", "f"), range("A", "F"));
const keywords = `
  addhandler addressof alias and andalso as async await byref byval call case catch class
  const continue declare default delegate dim directcast do each else elseif end enum erase
  error event exit finally for friend function get gettype getxmlnamespace global gosub goto
  handles if implements imports in inherits interface is isnot iterator key let lib like loop
  me mod module mustinherit mustoverride mybase myclass namespace narrowing new next not
  notinheritable notoverridable of off on operator option optional or orelse overloads
  overridable overrides paramarray partial private property protected public readonly redim
  rem removehandler resume return select set shadows shared static step stop structure sub
  synclock then throw to try trycast typeof using variant wend when while widening with
  withevents writeonly xor yield
`
  .trim()
  .split(/\s+/);
const types = `
    boolean byte char date decimal double integer long object sbyte short single string
    uinteger ulong ushort
  `
  .trim()
  .split(/\s+/);
const declarationWords = ["sub", "function", "property", "operator"];
const directives = `
  const if elseif else end region externalsource externalchecksum enable disable reference
  r load
`
  .trim()
  .split(/\s+/);
export const basicKeywords = `
  and as byref byval call case class const dim do each else elseif end enum erase error event
  exit explicit for friend function get global gosub goto if in is let lib like loop me mod
  new next not on option optional or paramarray preserve private property public redim rem
  resume return select set static step stop sub then to type until variant wend while with
  withevents xor
`
  .trim()
  .split(/\s+/);

export type VbExtension = (base: {
  all: typeof all;
  digit: typeof digit;
  start: typeof start;
  rest: typeof rest;
  ident: typeof ident;
}) => {
  name: string;
  aliases?: readonly string[];
  keywords: readonly string[];
  types: readonly string[];
  builtins?: readonly string[];
  declarationWords?: readonly string[];
  directives?: readonly string[];
  classic?: boolean;
  number?: Arm;
  beforeIdentifiers?: readonly Arm[];
  statementLeading?: readonly Arm[];
  declarationLeading?: readonly Arm[];
  states?: Record<string, State>;
};

export function vb(extension?: VbExtension) {
  const ext = extension?.({ all, digit, start, rest, ident });
  const words = ext?.keywords ?? keywords;
  const languageTypes = ext?.types ?? types;
  const declarations = ext?.declarationWords ?? declarationWords;
  const wordCases = [
    ...declarations.map((text) => ({
      text,
      then: [paint("keyword" as const), setState("declaration")],
    })),
    ...keywordTable(
      words.filter((word) => !declarations.includes(word)),
      "keyword",
    ),
    ...keywordTable(languageTypes, "type"),
    ...keywordTable(["true", "false", "nothing", ...(ext?.builtins ?? [])], "constant.builtin"),
  ];
  const suffix = optional(choice([byte("uU"), byte("sSiIlL")], [byte("sSiIlLdDfFrR%&@!#$")]));
  const number = on(
    "&0123456789",
    choice(
      [literal("&"), byte("hH"), bytes(hex)],
      [literal("&"), byte("oO"), bytes(union("01234567", "_"))],
      [literal("&"), byte("bB"), bytes(union("01", "_"))],
      [
        bytes(digits),
        optional(literal("."), byte(digit), bytes(digits, { min: 0 })),
        optional(byte("eE"), optional(byte("+-")), bytes(digits)),
      ],
    ),
    suffix,
    paint("number"),
  );
  const comments = [
    token("'", "comment", pushState("comment")),
    token("’", "comment", pushState("comment")),
  ];
  const date = on("#", literal("#"), bytes(except(all, "#\r\n")), literal("#"), paint("string"));
  const attribute = on(
    "<",
    literal("<"),
    lookahead(bytes(" \t", { min: 0 }), ...ident, bytes(" \t", { min: 0 }), byte("(,:>")),
    paint("punctuation.special"),
    pushState("attribute"),
  );
  const continuation = on(
    "_",
    literal("_"),
    lookahead(bytes(" \t", { min: 0 }), byte("\r\n")),
    paint("punctuation.special"),
    setState("continuedLine"),
  );
  const code = [
    ...comments,
    continuation,
    ...(ext?.classic ? [] : [token('$"', "string", pushState("interpolated"))]),
    token('"', "string", pushState("string")),
    date,
    ext?.number ?? number,
    ...(ext?.classic ? [] : [token("[", "variable", pushState("escapedIdentifier"))]),
    ...(ext?.beforeIdentifiers ?? []),
    on(
      start,
      ...ident,
      lookahead(bytes(" \t", { min: 0 }), literal("(")),
      classify(wordCases, [paint("function")], { caseless: true }),
    ),
    on(start, ...ident, classify(wordCases, [paint("variable")], { caseless: true })),
    ...(ext?.classic
      ? ["<=", ">=", "<>", ":="]
      : [
          "<=",
          ">=",
          "<>",
          ":=",
          "+=",
          "-=",
          "*=",
          "/=",
          "\\=",
          "^=",
          "&=",
          "<<=",
          ">>=",
          "<<",
          ">>",
        ]
    ).map((op) => token(op, "operator")),
    token(oneOf("+-*/\\^&=<>"), "operator"),
    token(oneOf(ext?.classic ? "()" : "(){}"), "punctuation.bracket"),
    token(oneOf(".,;"), "punctuation.delimiter"),
  ];

  return defineGrammar({
    name: ext?.name ?? "vb",
    aliases: ext ? ext.aliases : ["vbnet", "vb.net"],
    initial: "statementStart",
    states: {
      statementStart: {
        style: "plain",
        arms: [
          token("\uFEFF", "plain"),
          on(" \t", bytes(" \t"), paint("plain")),
          ...(ext?.statementLeading ?? []),
          on(
            "#",
            literal("#"),
            choice(
              ...(ext?.directives ?? directives).map((word) =>
                [...word].map((letter) => byte(letter + letter.toUpperCase())),
              ),
            ),
            notNext(rest),
            paint("keyword"),
            setState("directive"),
          ),
          on(
            "rR",
            byte("rR"),
            byte("eE"),
            byte("mM"),
            notNext(rest),
            choice([lookahead(byte(" \t"))], [lineEnd()]),
            paint("comment"),
            pushState("comment"),
          ),
          ...(ext?.classic ? [] : [attribute]),
          token("\n", "plain"),
          token("\r", "plain"),
        ],
        otherwise: [setState("code")],
      },
      directive: {
        style: "plain",
        arms: [
          token("\n", "plain", setState("statementStart")),
          token("\r", "plain", setState("statementStart")),
          on(
            "rRwWeE",
            choice(
              ...["region", "warning", "externalsource", "externalchecksum"].map((word) =>
                [...word].map((letter) => byte(letter + letter.toUpperCase())),
              ),
            ),
            notNext(rest),
            paint("keyword"),
          ),
          ...code,
        ],
      },
      code: {
        style: "plain",
        arms: [
          token("\n", "plain", setState("statementStart")),
          token("\r", "plain", setState("statementStart")),
          token(":", "punctuation.delimiter", setState("statementStart")),
          ...code,
        ],
      },
      declaration: {
        style: "plain",
        arms: [
          token("\n", "plain", setState("statementStart")),
          token("\r", "plain", setState("statementStart")),
          token(":", "punctuation.delimiter", setState("statementStart")),
          token("(", "punctuation.bracket", pushState("parameterStart")),
          ...(ext?.declarationLeading ?? []),
          ...code,
        ],
      },
      parameterStart: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...(ext?.classic ? [] : [attribute]),
          token(")", "punctuation.bracket", popState()),
          on(
            start,
            ...ident,
            classify(
              [
                ...keywordTable(
                  ext?.classic
                    ? ["byval", "byref", "optional", "paramarray"]
                    : `byval byref optional paramarray of`.trim().split(/\s+/),
                  "keyword",
                ),
                ...languageTypes.map((text) => ({
                  text,
                  then: [paint("type" as const), setState("parameter")],
                })),
              ],
              [paint("variable"), setState("parameter")],
              { caseless: true },
            ),
          ),
        ],
        otherwise: [setState("parameter")],
      },
      parameter: {
        style: "plain",
        arms: [
          token(",", "punctuation.delimiter", setState("parameterStart")),
          token(")", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("parameterNested")),
          ...code,
        ],
      },
      parameterNested: {
        style: "plain",
        arms: [
          token("(", "punctuation.bracket", pushState("parameterNested")),
          token(")", "punctuation.bracket", popState()),
          ...code,
        ],
      },
      attribute: {
        style: "plain",
        arms: [
          token(">", "punctuation.special", popState()),
          token("(", "punctuation.bracket", pushState("attributeNested")),
          token('"', "string", pushState("string")),
          on(start, ...ident, paint("attribute")),
          number,
          token(oneOf(",:."), "punctuation.delimiter"),
          token(oneOf("=+-*/"), "operator"),
        ],
      },
      attributeNested: {
        style: "plain",
        arms: [
          token("(", "punctuation.bracket", pushState("attributeNested")),
          token(")", "punctuation.bracket", popState()),
          ...code,
        ],
      },
      continuedLine: {
        style: "plain",
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          on("\r\n", choice([literal("\r\n")], [byte("\r\n")]), paint("plain"), setState("code")),
        ],
        otherwise: [setState("code")],
      },
      interpolated: {
        style: "string",
        arms: [
          token('""', "string.escape"),
          token("{{", "string.escape"),
          token("}}", "string.escape"),
          token("{", "punctuation.special", pushState("interpolation")),
          token('"', "string", popState()),
          redispatch("\r\n", popState()),
        ],
      },
      interpolation: {
        style: "plain",
        arms: [
          token("}", "punctuation.special", popState()),
          token("{", "punctuation.bracket", pushState("interpolationNested")),
          token(":", "punctuation.delimiter", setState("format")),
          ...code,
        ],
      },
      interpolationNested: {
        style: "plain",
        arms: [
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("interpolationNested")),
          ...code,
        ],
      },
      format: {
        style: "string",
        arms: [token("}", "punctuation.special", popState()), redispatch("\r\n", popState())],
      },
      string: {
        style: "string",
        arms: [
          token('""', "string.escape"),
          ...(ext?.classic
            ? [token('"', "string", popState())]
            : [on('"', literal('"'), optional(byte("cC")), paint("string"), popState())]),
          redispatch("\r\n", popState()),
        ],
      },
      escapedIdentifier: {
        style: "variable",
        arms: [token("]", "variable", popState()), redispatch("\r\n", popState())],
      },
      comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
      ...(ext?.states ?? {}),
    } satisfies Record<string, State>,
  });
}

export default {
  ...vb(),
  extensions: ["vb"],
};
