import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  except,
  keywordTable,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  repeat,
  setState,
  shell,
  token,
} from "#/grammar/mod.ts";
import { c, type CExtension } from "#/languages/systems/c/grammar.ts";

export const cppExtension: CExtension = ({
  digit,
  upper,
  hex,
  start,
  rest,
  ident,
  typeSuffix,
  strings,
  comments,
}) => {
  const cppDelimiter = except(byteSet({ ranges: [[33, 126]] }), "()\\");
  const cppDigits = (set: typeof digit) => [
    byte(set),
    repeat(choice([byte(set)], [literal("'"), byte(set)])),
  ];
  const cppNumber = on(
    ".0123456789",
    choice(
      [
        literal("0"),
        byte("xX"),
        ...cppDigits(hex),
        optional(literal("."), optional(...cppDigits(hex))),
        optional(byte("pP"), optional(byte("+-")), ...cppDigits(digit)),
      ],
      [literal("0"), byte("bB"), ...cppDigits("01")],
      [
        choice(
          [...cppDigits(digit), optional(literal("."), optional(...cppDigits(digit)))],
          [literal("."), ...cppDigits(digit)],
        ),
        optional(byte("eE"), optional(byte("+-")), ...cppDigits(digit)),
      ],
    ),
    bytes("uUlLfFzZ", { min: 0 }),
    optional(byte(start), bytes(rest, { min: 0 })),
    paint("number"),
  );
  const cppRaw = ['u8R"', 'uR"', 'UR"', 'LR"', 'R"'].map((prefix) =>
    on(
      prefix[0]!,
      literal(prefix),
      lookahead(bytes(cppDelimiter, { min: 0, max: 16 }), literal("(")),
      paint("string"),
      shell.captureReset(),
      pushState("cppRawHead"),
    ),
  );
  const whitespace = on(" \t\r\n", bytes(" \t\r\n"), paint("plain"));
  const functionName = on(
    start,
    ...ident,
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    paint("function"),
    popState(),
  );
  return {
    name: "cpp",
    aliases: ["c++", "cc", "cxx", "hpp", "hxx", "h++"],
    keywords: (keywords) => {
      keywords.splice(keywords.indexOf("auto"), 1);
      keywords.push(
        ...`
          asm catch co_await co_return co_yield consteval constinit decltype delete
          dynamic_cast static_cast reinterpret_cast const_cast explicit export friend
          mutable new noexcept private protected public template throw try typeid using
          virtual concept requires namespace
        `
          .trim()
          .split(/\s+/),
      );
    },
    types: (types) => {
      types.push(...["auto", "char8_t", "char16_t", "char32_t", "wchar_t"]);
    },
    aggregateKeywords: ["class"],
    aggregateHead: "tag",
    constants: ["true", "false", "nullptr"],
    wordCases: [
      ...keywordTable(
        `and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq`.trim().split(/\s+/),
        "operator",
      ),
      { text: "operator", then: [paint("keyword"), pushState("cppOperator")] },
      { text: "typename", then: [paint("keyword"), pushState("tag")] },
    ],
    beforeStrings: [token("[[", "punctuation.special", pushState("cppAttribute")), ...cppRaw],
    number: cppNumber,
    beforeIdentifiers: [
      on(
        "im",
        choice([literal("import")], [literal("module")]),
        notNext(rest),
        lookahead(choice([bytes(" \t"), byte(start)], [bytes(" \t", { min: 0 }), byte('<":')])),
        paint("keyword"),
      ),
    ],
    identifierFallbacks: [on(upper, ...ident, paint("type"))],
    beforeFields: [token("::", "operator", pushState("cppScope"))],
    brackets: [
      token(")", "punctuation.bracket", pushState("cppAfterParen")),
      token(oneOf("}[]("), "punctuation.bracket"),
    ],
    rootLeading: [
      on("m", lineStart(), literal("module"), lookahead(literal(";")), paint("keyword")),
    ],
    indentBeforeLabels: [
      on("m", literal("module"), lookahead(literal(";")), paint("keyword"), popState()),
    ],
    tagBeforeName: [
      on("cs", choice([literal("class")], [literal("struct")]), notNext(rest), paint("keyword")),
    ],
    tagNameEnd: [setState("cppTagAfter")],
    fieldBeforeName: [functionName],
    stringEnd: [setState("cppSuffix")],
    states: () => ({
      cppAttribute: {
        style: "plain" as const,
        arms: [
          token("]]", "punctuation.special", popState()),
          ...comments,
          ...cppRaw,
          ...strings,
          cppNumber,
          on(start, ...ident, paint("attribute")),
          token("::", "operator"),
          token(oneOf("()[]"), "punctuation.bracket"),
          token(",", "punctuation.delimiter"),
        ],
      },
      cppTagAfter: {
        style: "plain" as const,
        arms: [whitespace, on("f", literal("final"), notNext(rest), paint("keyword"), popState())],
        otherwise: [popState()],
      },
      cppAfterParen: {
        style: "plain" as const,
        arms: [
          whitespace,
          ...comments,
          on(
            "cof",
            choice([literal("const")], [literal("override")], [literal("final")]),
            notNext(rest),
            paint("keyword"),
          ),
          on("n", literal("noexcept"), notNext(rest), paint("keyword")),
          token("->", "operator", setState("cppTrailingReturn")),
        ],
        otherwise: [popState()],
      },
      cppTrailingReturn: {
        style: "plain" as const,
        arms: [whitespace, functionName, on(start, ...ident, paint("type"), popState())],
        otherwise: [popState()],
      },
      cppScope: {
        style: "plain" as const,
        arms: [
          whitespace,
          functionName,
          on(
            start,
            ...ident,
            lookahead(bytes(" \t", { min: 0 }), literal("<")),
            paint("type"),
            popState(),
          ),
          on(upper, ...ident, paint("type"), popState()),
          on(start, ...typeSuffix, paint("type"), popState()),
          on(
            start,
            ...ident,
            classify(
              keywordTable(
                `string string_view vector array optional unique_ptr shared_ptr tuple map set span`
                  .trim()
                  .split(/\s+/),
                "type",
                () => [popState()],
              ),
              [paint("variable"), popState()],
            ),
          ),
        ],
        otherwise: [popState()],
      },
      cppRawHead: {
        style: "string" as const,
        arms: [
          on(
            cppDelimiter,
            bytes(cppDelimiter, { max: 16 }),
            paint("string"),
            shell.captureAppend(),
          ),
          token("(", "string", setState("cppRaw")),
        ],
      },
      cppRaw: {
        style: "string" as const,
        arms: [
          on(
            ")",
            literal(")"),
            shell.captured(),
            literal('"'),
            paint("string"),
            setState("cppSuffix"),
          ),
        ],
      },
      cppSuffix: {
        style: "plain" as const,
        arms: [on(start, ...ident, paint("string"), popState())],
        otherwise: [popState()],
      },
      cppOperator: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token('""', "operator", setState("cppOperatorSuffix")),
        ],
        otherwise: [popState()],
      },
      cppOperatorSuffix: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          on(start, ...ident, paint("function"), popState()),
        ],
        otherwise: [popState()],
      },
    }),
  };
};

export default {
  ...c(cppExtension),
  extensions: ["cpp", "cc", "cxx", "c++", "C", "h", "hh", "hpp", "hxx", "h++", "inl", "ipp", "tpp"],
};
