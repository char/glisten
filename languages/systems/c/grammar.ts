import {
  byte,
  bytes,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  lineStart,
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
  type Effect,
  type State,
} from "#/grammar/mod.ts";

export type CBase = ReturnType<typeof cBase>;
/** Arm and state insertion order affects both matching priority and generated output. */
export type CExtension = (base: CBase) => {
  name: string;
  aliases?: readonly string[];
  keywords?: (words: string[]) => void;
  types?: (words: string[]) => void;
  aggregateKeywords?: readonly string[];
  aggregateHead?: string;
  constants?: readonly string[];
  wordCases?: readonly { text: string; then: readonly Effect[] }[];
  beforeStrings?: readonly Arm[];
  number?: Arm;
  beforeIdentifiers?: readonly Arm[];
  identifierFallbacks?: readonly Arm[];
  beforeFields?: readonly Arm[];
  beforeOperators?: readonly Arm[];
  beforeBraces?: readonly Arm[];
  brackets?: readonly Arm[];
  rootLeading?: readonly Arm[];
  rootBeforeCode?: readonly Arm[];
  indentBeforeLabels?: readonly Arm[];
  tagBeforeName?: readonly Arm[];
  tagNameEnd?: readonly Effect[];
  fieldBeforeName?: readonly Arm[];
  directiveCases?: readonly { text: string; then: readonly Effect[] }[];
  stringEnd?: readonly Effect[];
  states?: (code: readonly Arm[]) => Record<string, State>;
};

function cBase() {
  const digit = range("0", "9");
  const upper = range("A", "Z");
  const hex = union(digit, range("a", "f"), range("A", "F"));
  const start = union("_", range("a", "z"), range("A", "Z"));
  const rest = union(start, digit);
  const ident = [byte(start), bytes(rest, { min: 0 })];
  const typeSuffix = [
    lookahead(byte(start)),
    repeat(notLookahead(literal("_t"), notNext(rest)), byte(rest)),
    literal("_t"),
    notNext(rest),
  ];
  const strings = ["u8", "u", "U", "L", ""].flatMap((prefix) => [
    token(`${prefix}\"`, "string", pushState("string")),
    token(`${prefix}'`, "string", pushState("char")),
  ]);
  const comments = [
    token("//", "comment", pushState("lineComment")),
    token("/*", "comment", pushState("blockComment")),
  ];
  const number = on(
    ".0123456789",
    choice(
      [
        literal("0"),
        byte("xX"),
        bytes(hex),
        optional(literal("."), bytes(hex, { min: 0 })),
        optional(byte("pP"), optional(byte("+-")), bytes(digit)),
      ],
      [literal("0"), byte("bB"), bytes("01")],
      [
        choice(
          [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
          [literal("."), bytes(digit)],
        ),
        optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      ],
    ),
    bytes("uUlLfF", { min: 0 }),
    paint("number"),
  );

  return { digit, upper, hex, start, rest, ident, typeSuffix, strings, comments, number };
}

export function c(extension?: CExtension) {
  const base = cBase();
  const { digit, upper, hex, start, rest, ident, typeSuffix, strings, comments, number } = base;
  const ext = extension?.(base);
  const keywords = `
    auto break case const continue default do else extern for if inline register restrict return
    sizeof static switch typedef volatile while _Alignas _Alignof _Atomic _Generic _Noreturn
    _Static_assert _Thread_local alignas alignof constexpr static_assert thread_local typeof
    typeof_unqual
  `
    .trim()
    .split(/\s+/);
  const types = `
    void char short int long float double signed unsigned _Bool _Complex _Imaginary bool _BitInt
    _Decimal32 _Decimal64 _Decimal128
  `
    .trim()
    .split(/\s+/);
  ext?.keywords?.(keywords);
  ext?.types?.(types);
  const cases = [
    ...keywordTable(
      keywords.filter((word) => word !== "typedef"),
      "keyword",
    ),
    { text: "typedef", then: [paint("keyword"), pushState("typedefDecl")] },
    ...keywordTable(types, "type"),
    ...["struct", "union", ...(ext?.aggregateKeywords ?? [])].map((text) => ({
      text,
      then: [paint("keyword"), pushState(ext?.aggregateHead ?? "aggregateHead")],
    })),
    ...keywordTable(ext?.constants ?? [], "constant.builtin"),
    ...(ext?.wordCases ?? []),
    { text: "enum", then: [paint("keyword"), pushState("tag")] },
    { text: "goto", then: [paint("keyword"), pushState("gotoLabel")] },
  ];
  const words = classify(cases, [paint("variable")]);
  const calls = classify(cases, [paint("function")]);
  const declarationType = classify(cases, [paint("type")]);
  const typedefName = classify(
    [
      ...cases,
      ...["__attribute__", "__declspec"].map((text) => ({ text, then: [paint("function")] })),
    ],
    [paint("type")],
  );
  const labels = classify(
    keywordTable(keywords, "keyword", () => [popState()]),
    [paint("label"), popState()],
  );
  const lineLabels = classify(keywordTable(keywords, "keyword"), [paint("label")]);
  const fieldCases = [
    ...keywordTable(keywords, "keyword"),
    ...keywordTable(types, "type", () => [pushState("fieldDecl")]),
    ...["struct", "union"].map((text) => ({
      text,
      then: [paint("keyword"), pushState("fieldDecl"), pushState("aggregateHead")],
    })),
    { text: "enum", then: [paint("keyword"), pushState("fieldDecl"), pushState("enumHead")] },
  ];
  const fieldWords = classify(fieldCases, [paint("variable")]);
  const fieldType = classify(fieldCases, [paint("type"), pushState("fieldDecl")]);
  const fieldName = classify(cases, [paint("variable.member"), setState("fieldTail")]);
  const declaration = [
    lookahead(
      bytes(" \t"),
      optional(byte("*"), bytes(" \t", { min: 0 })),
      ...ident,
      bytes(" \t", { min: 0 }),
      byte("=;,[()"),
    ),
  ];
  const escape = on(
    "\\",
    literal("\\"),
    choice(
      [literal("x"), bytes(hex)],
      [literal("u"), bytes(hex, { min: 4, max: 4 })],
      [literal("U"), bytes(hex, { min: 8, max: 8 })],
      [bytes("01234567", { min: 1, max: 3 })],
      [character()],
    ),
    paint("string.escape"),
  );
  const whitespace = on(" \t\r\n", bytes(" \t\r\n"), paint("plain"));
  const label = on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(":")),
    labels,
  );
  const code = [
    ...comments,
    ...(ext?.beforeStrings ?? []),
    ...strings,
    ext?.number ?? number,
    ...(ext?.beforeIdentifiers ?? []),
    on(start, ...ident, lookahead(bytes(" \t", { min: 0 }), literal("(")), calls),
    on(start, ...ident, ...declaration, declarationType),
    on(start, ...typeSuffix, paint("type")),
    on(
      upper,
      byte(upper),
      bytes(union(upper, digit, "_"), { min: 0 }),
      notNext(rest),
      paint("constant.builtin"),
    ),
    ...(ext?.identifierFallbacks ?? []),
    on(start, ...ident, words),
    ...(ext?.beforeFields ?? []),
    token("->", "operator", pushState("field")),
    token(".", "operator", pushState("field")),
    ...(ext?.beforeOperators ?? []),
    token(oneOf("+-*/%=!<>&|^~?:"), "operator"),
    ...(ext?.beforeBraces ?? []),
    token("{", "punctuation.bracket", pushState("labelCandidate")),
    ...(ext?.brackets ?? [token(oneOf("}[]()"), "punctuation.bracket")]),
    token(";", "punctuation.delimiter", pushState("labelCandidate")),
    token(",", "punctuation.delimiter"),
  ];

  return defineGrammar({
    name: ext?.name ?? "c",
    ...(ext?.aliases ? { aliases: ext.aliases } : {}),
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          on(" \t\r", lineStart(), bytes(" \t\r"), paint("plain"), pushState("lineIndent")),
          on("#", lineStart(), literal("#"), paint("keyword"), pushState("directiveName")),
          ...(ext?.rootLeading ?? []),
          on(
            "/",
            lineStart(),
            literal("/*"),
            paint("comment"),
            pushState("lineIndent"),
            pushState("blockComment"),
          ),
          on(
            start,
            lineStart(),
            ...ident,
            lookahead(bytes(" \t", { min: 0 }), literal(":"), notNext(":")),
            lineLabels,
          ),
          token("/*", "comment", pushState("rootComment")),
          ...(ext?.rootBeforeCode ?? []),
          ...code,
        ],
      },
      rootComment: {
        style: "comment",
        arms: [
          token("*/", "comment", popState()),
          token("\\\n", "comment"),
          token("\n", "comment", setState("rootCommentAfterNewline")),
        ],
      },
      rootCommentAfterNewline: {
        style: "comment",
        arms: [token("*/", "comment", setState("lineIndent"))],
      },
      lineIndent: {
        style: "plain",
        arms: [
          on(" \t\r", bytes(" \t\r"), paint("plain")),
          token("/*", "comment", pushState("blockComment")),
          token("#", "keyword", popState(), pushState("directiveName")),
          ...(ext?.indentBeforeLabels ?? []),
          label,
        ],
        otherwise: [popState()],
      },
      labelCandidate: {
        style: "plain",
        arms: [on(" \t\r", bytes(" \t\r"), paint("plain")), label],
        otherwise: [popState()],
      },
      typedefDecl: {
        style: "plain",
        arms: [
          token(";", "punctuation.delimiter", popState()),
          token("(", "punctuation.bracket", pushState("typedefParen")),
          token("{", "punctuation.bracket", pushState("typedefBrace")),
          on(start, ...ident, lookahead(bytes(" \t\r\n", { min: 0 }), byte(",;[(")), typedefName),
          ...code,
        ],
      },
      typedefParen: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("typedefParen")),
          token("{", "punctuation.bracket", pushState("typedefBrace")),
          ...code,
        ],
      },
      typedefBrace: {
        style: "plain",
        arms: [
          token("}", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("typedefParen")),
          token("{", "punctuation.bracket", pushState("typedefBrace")),
          ...code,
        ],
      },
      gotoLabel: {
        style: "plain",
        arms: [whitespace, ...comments, on(start, ...ident, paint("label"), popState())],
        otherwise: [popState()],
      },
      aggregateHead: {
        style: "plain",
        arms: [
          whitespace,
          ...comments,
          on(start, ...ident, paint("type"), setState("aggregateAfter")),
          token("{", "punctuation.bracket", setState("structBody")),
        ],
        otherwise: [popState()],
      },
      aggregateAfter: {
        style: "plain",
        arms: [whitespace, ...comments, token("{", "punctuation.bracket", setState("structBody"))],
        otherwise: [popState()],
      },
      structIndent: {
        style: "plain",
        arms: [
          on(" \t\r", bytes(" \t\r"), paint("plain")),
          token("/*", "comment", pushState("blockComment")),
          token("#", "keyword", popState(), pushState("directiveName")),
        ],
        otherwise: [popState()],
      },
      structBody: {
        style: "plain",
        arms: [
          on(" \t\r", lineStart(), bytes(" \t\r"), paint("plain"), pushState("structIndent")),
          on("#", lineStart(), literal("#"), paint("keyword"), pushState("directiveName")),
          on(
            "/",
            lineStart(),
            literal("/*"),
            paint("comment"),
            pushState("structIndent"),
            pushState("blockComment"),
          ),
          token("}", "punctuation.bracket", popState()),
          ...comments,
          ...strings,
          number,
          on(start, ...ident, ...declaration, fieldType),
          on(start, ...typeSuffix, paint("type"), pushState("fieldDecl")),
          on(start, ...ident, fieldWords),
          ...code,
        ],
      },
      enumHead: {
        style: "plain",
        arms: [
          whitespace,
          ...comments,
          on(start, ...ident, paint("type"), setState("enumAfter")),
          token("{", "punctuation.bracket", setState("enumBody")),
        ],
        otherwise: [popState()],
      },
      enumAfter: {
        style: "plain",
        arms: [whitespace, ...comments, token("{", "punctuation.bracket", setState("enumBody"))],
        otherwise: [popState()],
      },
      enumBody: {
        style: "plain",
        arms: [
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("typedefBrace")),
          ...code,
        ],
      },
      fieldDecl: {
        style: "plain",
        arms: [
          whitespace,
          ...comments,
          token("*", "operator"),
          token("(", "punctuation.bracket"),
          on(start, ...ident, fieldName),
        ],
        otherwise: [popState()],
      },
      fieldTail: {
        style: "plain",
        arms: [
          token(";", "punctuation.delimiter", popState()),
          token(",", "punctuation.delimiter", setState("fieldDecl")),
          token("[", "punctuation.bracket", pushState("fieldArray")),
          ...code,
        ],
      },
      fieldArray: {
        style: "plain",
        arms: [
          token("]", "punctuation.bracket", popState()),
          token("[", "punctuation.bracket", pushState("fieldArray")),
          ...code,
        ],
      },
      tag: {
        style: "plain",
        arms: [
          whitespace,
          ...comments,
          ...(ext?.tagBeforeName ?? []),
          on(start, ...ident, paint("type"), ...(ext?.tagNameEnd ?? [popState()])),
        ],
        otherwise: [popState()],
      },
      ...(ext?.states?.(code) ?? {}),
      field: {
        style: "plain",
        arms: [
          on(" \t\r", bytes(" \t\r"), paint("plain")),
          ...comments,
          ...(ext?.fieldBeforeName ?? []),
          on(start, ...ident, paint("variable.member"), popState()),
        ],
        otherwise: [popState()],
      },
      directiveName: {
        style: "plain",
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("\n", "plain", popState()),
          on(
            start,
            ...ident,
            classify(
              [
                { text: "include", then: [paint("keyword"), setState("include")] },
                ...(ext?.directiveCases ?? []),
              ],
              [paint("keyword"), setState("directive")],
            ),
          ),
        ],
        otherwise: [setState("directive")],
      },
      directive: {
        style: "plain",
        arms: [token("\\\n", "plain"), token("\n", "plain", popState()), ...code],
      },
      include: {
        style: "plain",
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("\\\n", "plain"),
          token("<", "string", setState("directive"), pushState("header")),
          token('"', "string", setState("directive"), pushState("string")),
        ],
        otherwise: [setState("directive")],
      },
      header: {
        style: "string",
        arms: [token(">", "string", popState()), redispatch("\n", popState())],
      },
      string: {
        style: "string",
        arms: [
          escape,
          token('"', "string", ...(ext?.stringEnd ?? [popState()])),
          redispatch("\n", popState()),
        ],
      },
      char: {
        style: "string",
        arms: [
          escape,
          token("'", "string", ...(ext?.stringEnd ?? [popState()])),
          redispatch("\n", popState()),
        ],
      },
      lineComment: {
        style: "comment",
        arms: [token("\\\n", "comment"), redispatch("\n", popState())],
      },
      blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    },
  });
}

export default c();
