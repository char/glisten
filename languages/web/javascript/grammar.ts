import {
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  oneOf,
  openInjection,
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
} from "#/grammar/mod.ts";
import { typeStates } from "./types.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_$", range("a", "z"), upper, byteSet({ ranges: [[128, 255]] }));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const genericText = except(range(" ", "~"), "<>()=;");
const genericBody = (depth: number): ReturnType<typeof repeat> =>
  repeat(
    choice(
      [bytes(genericText)],
      ...(depth ? [[literal("<"), genericBody(depth - 1), literal(">")]] : []),
    ),
  );
const genericHead = [bytes(" \t", { min: 0 }), lookahead(...ident), genericBody(3), literal(">")];
const keywords = `
  async await break case catch class const continue debugger default delete do else export extends
  finally for function if import in instanceof let new of return static super switch throw try
  typeof var void while with yield get set from as
`
  .trim()
  .split(/\s+/);
const valueKeywords = `
  true false null undefined this
`
  .trim()
  .split(/\s+/);
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const expressionKeywords = new Set(
  `
  await case default delete do else in instanceof of return throw typeof void yield new extends
  class
`
    .trim()
    .split(/\s+/),
);
const comments = [
  token("//", "comment", pushState("lineComment")),
  on(
    "/",
    literal("/**"),
    notNext("/"),
    paint("comment"),
    pushState("docComment"),
    openInjection({ static: "jsdoc" }),
  ),
  token("/*", "comment", pushState("blockComment")),
];
const number = (after: string) =>
  on(
    ".0123456789",
    choice(
      [
        literal("0"),
        byte("xX"),
        bytes(union(digit, range("a", "f"), range("A", "F"), "_")),
        optional(literal("n")),
      ],
      [literal("0"), byte("bB"), bytes("01_"), optional(literal("n"))],
      [literal("0"), byte("oO"), bytes("01234567_"), optional(literal("n"))],
      [
        choice(
          [bytes(union(digit, "_")), optional(literal("."), bytes(union(digit, "_"), { min: 0 }))],
          [literal("."), byte(digit), bytes(union(digit, "_"), { min: 0 })],
        ),
        optional(byte("eE"), optional(byte("+-")), bytes(union(digit, "_"))),
        optional(literal("n")),
      ],
    ),
    paint("number"),
    setState(after),
  );
const hex = union(digit, range("a", "f"), range("A", "F"));
const escapeContent = choice(
  [literal("\r\n")],
  [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
  [literal("u"), bytes(hex, { min: 4, max: 4 })],
  [literal("x"), bytes(hex, { min: 2, max: 2 })],
  [character()],
);
const escape = on("\\", literal("\\"), escapeContent, paint("string.escape"));
const taggedEscape = on("\\", literal("\\"), escapeContent, hostPrefix(), paint("string.escape"));

// Tagged templates like html`...` inject their language. svg reuses xml;
// gql is an alias of graphql but static opens need the canonical name.
const taggedTemplates: readonly { readonly lang: string; readonly tags: readonly string[] }[] = [
  { lang: "html", tags: ["html"] },
  { lang: "css", tags: ["css"] },
  { lang: "scss", tags: ["scss"] },
  { lang: "less", tags: ["less"] },
  { lang: "sass", tags: ["sass"] },
  { lang: "sql", tags: ["sql"] },
  { lang: "graphql", tags: ["graphql", "gql"] },
  { lang: "markdown", tags: ["markdown", "md"] },
  { lang: "xml", tags: ["xml", "svg"] },
  { lang: "yaml", tags: ["yaml", "yml"] },
  { lang: "json", tags: ["json"] },
  { lang: "glsl", tags: ["glsl"] },
  { lang: "wgsl", tags: ["wgsl"] },
  { lang: "hlsl", tags: ["hlsl"] },
  { lang: "bash", tags: ["bash", "sh"] },
];
const cap = (name: string): string => name[0]!.toUpperCase() + name.slice(1);
const tagState = (lang: string): string => `tag${cap(lang)}`;
const templateTagState = (lang: string): string => `template${cap(lang)}`;
const reopenTagState = (lang: string): string => `reopen${cap(lang)}`;

type Context =
  | "root"
  | "brace"
  | "object"
  | "interpolation"
  | "paren"
  | "controlParen"
  | "array"
  | "ternaryTrue"
  | "ternaryFalse"
  | "tsClass"
  | "tsParen";

function code(
  context: Context,
  position: "Start" | "Value" | "After",
  jsx: boolean,
  types: boolean,
) {
  const before = context + "Start";
  const value = context + "Value";
  const after = context + "After";
  const mayStart = position !== "After";
  const typed = types
    ? [
        { text: "type", then: [paint("keyword"), setState(value), pushState("tsAliasName")] },
        {
          text: "interface",
          then: [paint("keyword"), setState(value), pushState("tsInterfaceName")],
        },
        ...["enum", "namespace", "module"].map((text) => ({
          text,
          then: [
            paint("keyword"),
            setState(value),
            pushState(text === "enum" ? "tsDeclName" : "tsNamespaceName"),
          ],
        })),
        { text: "satisfies", then: [paint("keyword"), setState(after), pushState("tsType")] },
        {
          text: "implements",
          then: [paint("keyword"), setState(after), pushState("tsHeritage")],
        },
        ...keywordTable(
          `
            declare abstract public private protected readonly override keyof infer asserts
          `
            .trim()
            .split(/\s+/),
          "keyword",
        ),
      ]
    : [];
  // An identifier that begins with a byte no reserved word of this variant begins with cannot
  // be one, so it skips the word lookup.
  const reserved = [...typed.map(({ text }) => text), ...keywords, ...valueKeywords];
  const freeLetters = [...alphabet]
    .filter((letter) => !reserved.some((text) => text.startsWith(letter)))
    .join("");
  const freeStart = union(upper, "_$", freeLetters, byteSet({ ranges: [[128, 255]] }));
  const reservedStart = except(range("a", "z"), freeLetters);
  const callAhead = lookahead(bytes(" \t\r\n", { min: 0 }), literal("("));
  const words = (style: "variable" | "function") =>
    classify(
      [
        ...typed,
        ...keywordTable(valueKeywords, "constant.builtin", () => [setState(after)]),
        ...keywords
          .filter(
            (text) =>
              !(
                context === "tsClass" &&
                style === "function" &&
                ["if", "while", "for", "with"].includes(text)
              ),
          )
          .map((text) => ({
            text,
            then: [
              paint("keyword" as const),
              setState(
                ["else", "do", "if", "while", "for", "with"].includes(text)
                  ? before
                  : expressionKeywords.has(text) || ["const", "let", "var"].includes(text)
                    ? value
                    : after,
              ),
              ...(text === "import"
                ? [pushState("importHead")]
                : ["if", "while", "for", "with"].includes(text)
                  ? [pushState(text === "for" ? "forHead" : "controlHead")]
                  : ["class", "new", "extends"].includes(text)
                    ? [
                        pushState(
                          types && text === "class"
                            ? "tsClassName"
                            : types && text === "extends"
                              ? "tsHeritage"
                              : context + "TypeName",
                        ),
                      ]
                    : types && ["const", "let", "var"].includes(text)
                      ? [pushState("tsBinding")]
                      : types && text === "as"
                        ? [pushState("tsType")]
                        : types && text === "function"
                          ? [pushState("tsFunctionHead")]
                          : []),
            ],
          })),
      ],
      [paint(style), setState(after)],
    );
  return [
    ...(context === "interpolation" ? [token("}", "punctuation.special", popState())] : []),
    ...(context === "brace" || context === "object" || context === "tsClass"
      ? [token("}", "punctuation.bracket", popState())]
      : []),
    ...(context === "paren" || context === "controlParen"
      ? [
          token(
            ")",
            "punctuation.bracket",
            popState(),
            ...(types && context === "controlParen" ? [pushState("tsAfterParen")] : []),
          ),
        ]
      : []),
    ...(context === "tsParen"
      ? [token(")", "punctuation.bracket", popState(), pushState("tsAfterParen"))]
      : []),
    ...(context === "array" ? [token("]", "punctuation.bracket", popState())] : []),
    ...(context === "ternaryTrue"
      ? [token(":", "punctuation.delimiter", setState("ternaryFalseValue"))]
      : []),
    ...(context === "ternaryFalse" ? [redispatch(",;)]}", popState())] : []),
    ...comments,
    token('"', "string", setState(after), pushState("double")),
    token("'", "string", setState(after), pushState("single")),
    token("`", "string", setState(after), pushState("template")),
    ...(mayStart
      ? [
          token(
            "/",
            "string",
            setState(after),
            pushState("regex"),
            openInjection({ static: "regex" }),
          ),
        ]
      : []),
    ...(types
      ? [
          on(
            "<",
            literal("<"),
            lookahead(...genericHead, bytes(" \t", { min: 0 }), literal("(")),
            paint("punctuation.bracket"),
            pushState("tsAngle"),
          ),
          ...(!jsx && mayStart
            ? [
                on(
                  "<",
                  literal("<"),
                  lookahead(...genericHead),
                  paint("punctuation.bracket"),
                  pushState("tsAngle"),
                ),
              ]
            : []),
        ]
      : []),
    ...(jsx && mayStart
      ? [
          on(
            "<",
            literal("<"),
            lookahead(byte(union(start, ">"))),
            paint("punctuation.bracket"),
            setState(after),
            pushState("jsxOpen"),
          ),
        ]
      : []),
    number(after),
    ...taggedTemplates.flatMap(({ lang, tags }) =>
      tags.map((tag) =>
        on(
          tag[0]!,
          literal(tag),
          lookahead(literal("`")),
          paint("function"),
          setState(after),
          pushState(tagState(lang)),
        ),
      ),
    ),
    ...(context === "tsClass"
      ? [
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), optional(byte("?!")), literal(":")),
            paint("variable.member"),
            setState(after),
          ),
        ]
      : []),
    on(freeStart, ...ident, callAhead, paint("function"), setState(after)),
    on(reservedStart, ...ident, callAhead, words("function")),
    on(
      upper,
      byte(upper),
      bytes(union(upper, digit, "_"), { min: 0 }),
      notNext(rest),
      paint("constant.builtin"),
      setState(after),
    ),
    on(freeStart, ...ident, paint("variable"), setState(after)),
    on(reservedStart, ...ident, words("variable")),
    token("?.", "operator", setState(after), pushState("field")),
    token("...", "operator", setState(value)),
    token(".", "operator", setState(after), pushState("field")),
    token(
      "{",
      "punctuation.bracket",
      setState(position === "Value" ? after : before),
      pushState(position === "Value" ? "objectHead" : "braceStart"),
    ),
    token(
      "(",
      "punctuation.bracket",
      setState(after),
      pushState(types && context !== "ternaryTrue" ? "tsParenValue" : "parenValue"),
    ),
    token("[", "punctuation.bracket", setState(after), pushState("arrayValue")),
    ...(context === "root" ? [token("}", "punctuation.bracket", setState(before))] : []),
    token(",", "punctuation.delimiter", setState(context === "object" ? "objectHead" : value)),
    token(";", "punctuation.delimiter", setState(before)),
    token(
      ":",
      "punctuation.delimiter",
      setState(
        context === "root" || context === "brace" ? before : context === "tsClass" ? after : value,
      ),
      ...(types && (context === "paren" || context === "tsParen" || context === "controlParen")
        ? [pushState("tsType")]
        : types && context === "tsClass"
          ? [pushState("tsReturnStart")]
          : []),
    ),
    token("=>", "operator", setState(before)),
    token("??", "operator", setState(value)),
    ...(types && (context === "paren" || context === "tsParen" || context === "tsClass")
      ? [
          on(
            "?",
            literal("?"),
            lookahead(bytes(" \t\r\n", { min: 0 }), literal(":")),
            paint("operator"),
          ),
        ]
      : []),
    token("?", "operator", setState(after), pushState("ternaryTrueValue")),
    ...(types && position === "After"
      ? [on("!", literal("!"), notNext("="), paint("operator"))]
      : []),
    ...(types ? [on("@", literal("@"), ...ident, paint("function"))] : []),
    token("++", "operator", setState(after)),
    token("--", "operator", setState(after)),
    token(oneOf("+-*/%=!<>&|^~"), "operator", setState(value)),
  ];
}

const typeName = (after: string) => ({
  style: "plain" as const,
  arms: [
    on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
    ...comments,
    on(start, ...ident, paint("type"), popState(), setState(after)),
  ],
  otherwise: [popState()],
});

const jsxNameRest = union(rest, "-:");
const jsxName = [byte(start), bytes(jsxNameRest, { min: 0 })];
const jsxNames = (tag: "open" | "close") => {
  const next = tag === "open" ? [setState("jsxAttributes")] : [];
  return [
    on(
      start,
      ...jsxName,
      literal("."),
      ...jsxName,
      repeat(literal("."), ...jsxName),
      paint("type"),
      ...next,
    ),
    on(upper, ...jsxName, paint("type"), ...next),
    on(start, ...jsxName, paint("tag"), ...next),
  ];
};
const jsxStates = {
  jsxOpen: {
    style: "plain" as const,
    arms: [token(">", "punctuation.bracket", setState("jsxChildren")), ...jsxNames("open")],
  },
  jsxAttributes: {
    style: "plain" as const,
    arms: [
      token("/>", "punctuation.bracket", popState()),
      token(">", "punctuation.bracket", setState("jsxChildren")),
      token("{", "punctuation.special", pushState("interpolationValue")),
      token('"', "string", pushState("jsxDouble")),
      token("'", "string", pushState("jsxSingle")),
      token("=", "operator"),
      on(start, ...jsxName, paint("property")),
    ],
  },
  jsxChildren: {
    style: "plain" as const,
    arms: [
      token("</", "punctuation.bracket", setState("jsxClose")),
      token("<", "punctuation.bracket", pushState("jsxOpen")),
      token("{", "punctuation.special", pushState("interpolationValue")),
    ],
  },
  jsxClose: {
    style: "plain" as const,
    arms: [...jsxNames("close"), token(">", "punctuation.bracket", popState())],
  },
  jsxDouble: { style: "string" as const, arms: [token('"', "string", popState())] },
  jsxSingle: { style: "string" as const, arms: [token("'", "string", popState())] },
};

export function javascript({
  jsx = false,
  types = false,
}: { jsx?: boolean; types?: boolean } = {}) {
  const contexts = [
    "root",
    "brace",
    "object",
    "interpolation",
    "paren",
    "array",
    "ternaryTrue",
    "ternaryFalse",
    ...(types ? ["tsClass" as const, "tsParen" as const] : []),
    "controlParen",
  ] as const;
  return defineGrammar<string>({
    name: types ? (jsx ? "tsx" : "typescript") : jsx ? "jsx" : "javascript",
    ...(types && !jsx
      ? { aliases: ["ts"] }
      : jsx && !types
        ? { aliases: ["javascriptreact"] }
        : {}),
    initial: "initial",
    states: {
      initial: {
        style: "plain",
        arms: [token("#!", "comment", setState("rootStart"), pushState("lineComment"))],
        otherwise: [setState("rootStart")],
      },
      ...Object.fromEntries(
        contexts.flatMap((context) =>
          (["Start", "Value", "After"] as const).map((position) => [
            context + position,
            { style: "plain" as const, arms: code(context, position, jsx, types) },
          ]),
        ),
      ),
      importHead: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...comments,
          ...(!types
            ? [
                on(
                  upper,
                  byte(upper),
                  bytes(union(upper, digit, "_"), { min: 0 }),
                  notNext(rest),
                  paint("constant.builtin"),
                ),
              ]
            : []),
          on(
            start,
            ...ident,
            classify(keywordTable(types ? ["type", "as", "from"] : ["as", "from"], "keyword"), [
              paint("variable"),
            ]),
          ),
          token("{", "punctuation.bracket"),
          token("}", "punctuation.bracket"),
          token(",", "punctuation.delimiter"),
          token("*", "operator"),
          token('"', "string", popState(), pushState("double")),
          token("'", "string", popState(), pushState("single")),
        ],
        otherwise: [popState()],
      },
      forHead: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...comments,
          on(
            "a",
            ...ident,
            classify(
              [{ text: "await", then: [paint("keyword"), setState("controlHead")] }],
              [paint("variable"), popState()],
            ),
          ),
          token("(", "punctuation.bracket", setState("controlParenValue")),
        ],
        otherwise: [popState()],
      },
      controlHead: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...comments,
          token("(", "punctuation.bracket", setState("controlParenValue")),
        ],
        otherwise: [popState()],
      },
      objectHead: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...comments,
          token("*", "operator"),
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n"), ...ident, bytes(" \t\r\n", { min: 0 }), literal("(")),
            classify(keywordTable(["get", "set", "async"], "keyword"), [
              paint("variable.member"),
              setState("objectAfter"),
            ]),
          ),
          on(start, ...ident, paint("variable.member"), setState("objectAfter")),
        ],
        otherwise: [setState("objectValue")],
      },
      double: {
        style: "string",
        arms: [escape, token('"', "string", popState()), redispatch("\n\r", popState())],
      },
      single: {
        style: "string",
        arms: [escape, token("'", "string", popState()), redispatch("\n\r", popState())],
      },
      template: {
        style: "string",
        arms: [
          escape,
          token("${", "punctuation.special", pushState("interpolationValue")),
          token("`", "string", popState()),
        ],
      },
      ...Object.fromEntries(
        taggedTemplates.map(({ lang }) => [
          tagState(lang),
          {
            style: "plain" as const,
            arms: [
              token(
                "`",
                "string",
                setState(templateTagState(lang)),
                openInjection({ static: lang }),
              ),
            ],
            otherwise: [popState()],
          },
        ]),
      ),
      ...Object.fromEntries(
        taggedTemplates.map(({ lang }) => [
          templateTagState(lang),
          {
            style: "plain" as const,
            arms: [
              taggedEscape,
              on(
                "$",
                literal("${"),
                closeInjection(),
                paint("punctuation.special"),
                pushState(reopenTagState(lang)),
                pushState("interpolationValue"),
              ),
              on("`", literal("`"), closeInjection(), paint("string"), popState()),
            ],
          },
        ]),
      ),
      ...Object.fromEntries(
        taggedTemplates.map(({ lang }) => [
          reopenTagState(lang),
          {
            style: "plain" as const,
            arms: [],
            otherwise: [
              openInjection({ static: lang }),
              popState({ atRoot: templateTagState(lang) }),
            ],
          },
        ]),
      ),
      regex: {
        style: "string",
        arms: [
          escape,
          token("[", "string", pushState("regexClass")),
          on(
            "/",
            literal("/"),
            bytes(union(range("a", "z"), range("A", "Z")), { min: 0 }),
            closeInjection(),
            paint("string"),
            popState(),
          ),
          redispatch("\n\r", closeInjection(), popState()),
        ],
      },
      regexClass: {
        style: "string",
        arms: [escape, token("]", "string", popState()), redispatch("\n\r", popState())],
      },
      field: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          ...comments,
          on(start, ...ident, paint("variable.member"), popState()),
        ],
        otherwise: [popState()],
      },
      ...Object.fromEntries(
        contexts.map((context) => [context + "TypeName", typeName(context + "After")]),
      ),
      lineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
      blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
      docComment: {
        style: "comment",
        arms: [on("*", literal("*/"), closeInjection(), paint("comment"), popState())],
      },
      ...(jsx
        ? {
            ...jsxStates,
            ...(types
              ? {
                  jsxAttributes: {
                    ...jsxStates.jsxAttributes,
                    arms: [
                      ...comments,
                      token("<", "punctuation.bracket", pushState("tsAngle")),
                      ...jsxStates.jsxAttributes.arms,
                    ],
                  },
                }
              : {}),
          }
        : {}),
      ...(types ? typeStates : {}),
    },
  });
}

export default {
  ...javascript(),
  extensions: ["js", "mjs", "cjs"],
};
