import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
  literal,
  lookahead,
  repeat,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
  wrap,
  type State,
  type Arm,
  type Matcher,
} from "#/grammar/mod.ts";

type Dialect = "css" | "scss" | "less";

type Extension = {
  blockDelimiters: string;
  slashFollowers: string;
  classState: string;
  blockFragments: readonly (readonly Matcher[])[];
  valueMinus: readonly Arm[];
  valueAtoms: readonly Arm[];
  stringInterpolation: readonly Arm[];
  preludeValuesMode: "colored" | "plain";
  selectorAtoms: readonly Arm[];
  parentSelectors: readonly Arm[];
  declarations: readonly Arm[];
  rules: readonly Arm[];
  bareMixins(beforeBlock: Matcher): readonly Arm[];
  lineComments: readonly Arm[];
  valueBlocks: readonly Arm[];
  urlAtoms: readonly Arm[];
  prelude: readonly Arm[];
  preludeGroup: readonly Arm[];
  preludeValues(valueAtoms: readonly Arm[]): readonly Arm[];
  states(core: {
    valueAtoms: readonly Arm[];
    selectorAtoms: readonly Arm[];
  }): Record<string, State>;
};

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const nonAscii = byteSet({ ranges: [[128, 255]] });
const nameStart = union(range("a", "z"), range("A", "Z"), "_-", nonAscii);
const start = union(nameStart, "\\");
const rest = union(nameStart, digit);
const escape = [
  literal("\\"),
  choice([bytes(hex, { min: 1, max: 6 }), optional(byte(" \t\r\n\f"))], [character()]),
];
const ident = [choice([bytes(nameStart)], escape), repeat(choice([bytes(rest)], escape))];
const anyByte = byteSet({ ranges: [[0, 255]] });
const doubleContent = except(anyByte, '"\\\n\r\f');
const singleContent = except(anyByte, "'\\\n\r\f");
const commentContent = except(anyByte, "*");
const space = " \t\r\n\f";
const insensitive = (word: string) => [...word].map((c) => byte(c.toLowerCase() + c.toUpperCase()));
const words = (items: readonly string[], style: "operator" | "keyword") =>
  items.map((word) =>
    on(word[0]! + word[0]!.toUpperCase(), ...insensitive(word), notNext(rest), paint(style)),
  );
const mediaOperators = words(["and", "or", "not", "only"], "operator");
const comment = token("/*", "comment", pushState("comment"));
const lineComment = token("//", "comment", pushState("scssLineComment"));

const urlTail = except(byteSet({ ranges: [[0, 255]] }), ")}\n\r\f");
const strings = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
const valueStrings = [
  token('"', "string", pushState("doubleValueString")),
  token("'", "string", pushState("singleValueString")),
];
const badValueAtoms = [
  token("/*", "plain", pushState("badComment")),
  token('"', "plain", pushState("badDoubleString")),
  token("'", "plain", pushState("badSingleString")),
  token("(", "plain", pushState("badParen")),
  token("[", "plain", pushState("badBracket")),
  token("{", "plain", pushState("badBrace")),
  on("\\", ...escape, paint("plain")),
];
const brackets = [token("(", "punctuation.bracket", pushState("valueGroup"))];
const number = on(
  "+-.0123456789",
  optional(byte("+-")),
  choice([bytes(digit), optional(literal("."), bytes(digit))], [literal("."), bytes(digit)]),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  paint("number"),
  pushState("unit"),
);
const url = on(
  "uU",
  ...insensitive("url"),
  lookahead(literal("(")),
  paint("function"),
  pushState("urlOpen"),
);
const unicodeRange = on(
  "uU",
  byte("uU"),
  literal("+"),
  choice(
    [bytes(hex, { min: 5, max: 5 }), bytes("?", { min: 1, max: 1 })],
    [bytes(hex, { min: 4, max: 4 }), bytes("?", { min: 1, max: 2 })],
    [bytes(hex, { min: 3, max: 3 }), bytes("?", { min: 1, max: 3 })],
    [bytes(hex, { min: 2, max: 2 }), bytes("?", { min: 1, max: 4 })],
    [bytes(hex, { min: 1, max: 1 }), bytes("?", { min: 1, max: 5 })],
    [bytes("?", { min: 1, max: 6 })],
    [bytes(hex, { min: 1, max: 6 }), optional(literal("-"), bytes(hex, { min: 1, max: 6 }))],
  ),
  paint("number"),
);
const colorNames = `aliceblue antiquewhite aqua aquamarine azure beige bisque black
blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
transparent currentcolor`
  .trim()
  .split(/\s+/);
const identifierRest = union(rest, "\\");
const namedColors = keywordTable(colorNames, "plain", () => [
  wrap("constant.color", { from: "arm" }),
]);
const colorFunctions = `rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark`
  .trim()
  .split(/\s+/);
const colorCalls = keywordTable(colorFunctions, "function", () => [pushState("colorOpen")]);
const colorHex = on(
  "#",
  literal("#"),
  choice(
    ...[8, 6, 4, 3].map((count) => [
      bytes(hex, { min: count, max: count }),
      notNext(identifierRest),
    ]),
  ),
  paint("string"),
  wrap("constant.color", { from: "arm" }),
);

const keyframes = [
  on(
    "@",
    ...insensitive("@keyframes"),
    notNext(rest),
    paint("keyword"),
    pushState("keyframesPrelude"),
  ),
  on(
    "@",
    ...insensitive("@-webkit-keyframes"),
    notNext(rest),
    paint("keyword"),
    pushState("keyframesPrelude"),
  ),
];
const atRule = on("@", literal("@"), ...ident, paint("keyword"), pushState("prelude"));

const emptyExtension = (): Extension => ({
  blockDelimiters: "{};\"'/",
  slashFollowers: "*",
  classState: "className",
  blockFragments: [],
  valueMinus: [],
  valueAtoms: [],
  stringInterpolation: [],
  preludeValuesMode: "plain",
  selectorAtoms: [],
  parentSelectors: [],
  declarations: [],
  rules: [],
  bareMixins: () => [],
  lineComments: [],
  valueBlocks: [],
  urlAtoms: [],
  prelude: [],
  preludeGroup: [],
  preludeValues: () => [],
  states: () => ({}),
});

function scssExtension(): Extension {
  const interpolation = token("#{", "punctuation.special", pushState("scssInterpolation"));
  const variable = on("$", literal("$"), ...ident, paint("variable"));
  const scssAtoms = [lineComment, interpolation, variable];
  const namespacedCall = on(
    start,
    ...ident,
    literal("."),
    ...ident,
    lookahead(literal("(")),
    paint("function"),
  );
  const callableRules = ["@mixin", "@include", "@function"].map((name) =>
    on("@", literal(name), notNext(rest), paint("keyword"), pushState("scssCallable")),
  );
  const interpolationFragment = [
    literal("#{"),
    bytes(except(anyByte, "}"), { min: 0 }),
    literal("}"),
  ];
  const dynamicProperty = on(
    start,
    ...ident,
    lookahead(
      ...interpolationFragment,
      repeat(choice(ident, interpolationFragment)),
      bytes(space, { min: 0 }),
      literal(":"),
    ),
    paint("property"),
    pushState("scssProperty"),
  );

  return {
    ...emptyExtension(),
    valueMinus: [on("-", literal("-"), notNext(rest), paint("operator"))],
    valueAtoms: [
      ...scssAtoms,
      namespacedCall,
      on(
        "!",
        literal("!"),
        choice([literal("default")], [literal("global")]),
        notNext(rest),
        paint("keyword"),
      ),
    ],
    stringInterpolation: [interpolation],
    preludeValuesMode: "colored",
    selectorAtoms: [...scssAtoms, on("%", literal("%"), ...ident, paint("tag"))],
    declarations: [
      on(
        "$",
        literal("$"),
        ...ident,
        lookahead(bytes(space, { min: 0 }), literal(":")),
        paint("variable"),
        pushState("afterProperty"),
      ),
      dynamicProperty,
    ],
    rules: callableRules,
    lineComments: [lineComment],
    prelude: [
      ...scssAtoms,
      namespacedCall,
      ...words(["as", "with", "if", "in", "from", "through", "to"], "keyword"),
    ],
    preludeGroup: [
      ...scssAtoms,
      namespacedCall,
      ...words(["as", "with", "in", "from", "through", "to"], "keyword"),
    ],
    preludeValues(valueAtoms) {
      return [on("%", literal("%"), ...ident, paint("tag")), ...valueAtoms, token("!", "operator")];
    },
    states({ valueAtoms }): Record<string, State> {
      return {
        scssLineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
        scssCallable: {
          style: "plain",
          arms: [
            comment,
            lineComment,
            on(
              start,
              ...ident,
              optional(literal("."), ...ident),
              paint("function"),
              setState("prelude"),
            ),
            redispatch(";{}", popState()),
          ],
        },
        scssProperty: {
          style: "property",
          arms: [
            interpolation,
            on(start, ...ident, paint("property")),
            token(":", "punctuation.delimiter", setState("afterProperty"), pushState("value")),
            redispatch(";}", popState()),
          ],
        },
        scssInterpolation: {
          style: "plain",
          arms: [token("}", "punctuation.special", popState()), ...valueAtoms],
        },
      };
    },
  };
}

function lessExtension(): Extension {
  const lessInterpolation = token("@{", "punctuation.special", pushState("lessInterpolation"));
  const lessVariable = on("@", literal("@"), optional(literal("@")), ...ident, paint("variable"));
  const lessAtoms = [
    lineComment,
    lessInterpolation,
    lessVariable,
    on("$", literal("$"), ...ident, paint("variable")),
    token("`", "string", pushState("lessJavaScript")),
    on("%", literal("%"), lookahead(literal("(")), paint("function")),
    token("~", "operator"),
  ];
  const lessMixin = on(
    ".#",
    byte(".#"),
    lookahead(...ident, literal("(")),
    paint("punctuation.delimiter"),
    pushState("lessMixinName"),
  );
  const lessInterpolationFragment = [literal("@{"), ...ident, literal("}")];
  const lessDeclarations = [
    on(
      "@",
      literal("@"),
      ...ident,
      lookahead(bytes(space, { min: 0 }), literal(":")),
      paint("variable"),
      pushState("afterProperty"),
    ),
    on(
      "@",
      literal("@"),
      ...ident,
      lookahead(literal("(")),
      paint("variable"),
      pushState("lessMixinPrelude"),
    ),
    on(
      start,
      ...ident,
      lookahead(
        ...lessInterpolationFragment,
        repeat(choice(ident, lessInterpolationFragment)),
        bytes(space, { min: 0 }),
        literal(":"),
      ),
      paint("property"),
      pushState("lessProperty"),
    ),
    on(
      "@",
      lookahead(
        ...lessInterpolationFragment,
        repeat(choice(ident, lessInterpolationFragment)),
        bytes(space, { min: 0 }),
        literal(":"),
      ),
      literal("@{"),
      paint("punctuation.special"),
      pushState("lessProperty"),
      pushState("lessInterpolation"),
    ),
  ];

  return {
    ...emptyExtension(),
    blockDelimiters: "{};\"'/@",
    slashFollowers: "*/",
    classState: "lessClassName",
    blockFragments: [
      [literal("@{"), bytes(except(anyByte, "}"), { min: 0 }), literal("}")],
      [literal("@"), notNext("{")],
      [literal("//"), bytes(except(anyByte, "\r\n"), { min: 0 })],
    ],
    valueMinus: [on("-", literal("-"), notNext(rest), paint("operator"))],
    valueAtoms: [...lessAtoms, token(oneOf("[]"), "punctuation.bracket")],
    stringInterpolation: [lessInterpolation],
    selectorAtoms: [lessMixin, ...lessAtoms],
    parentSelectors: [
      on(
        "&",
        literal("&"),
        lookahead(choice([literal("-")], [literal("@{")])),
        paint("tag"),
        pushState("lessClassName"),
      ),
    ],
    rules: lessDeclarations,
    bareMixins(beforeBlock) {
      const lessBareMixin = on(
        ".#",
        byte(".#"),
        lookahead(
          choice(ident, lessInterpolationFragment),
          repeat(choice(ident, lessInterpolationFragment)),
          notNext("("),
          beforeBlock,
          literal(";"),
        ),
        paint("punctuation.delimiter"),
        pushState("lessBareMixinName"),
      );
      return [lessBareMixin];
    },
    lineComments: [lineComment],
    valueBlocks: [token("{", "punctuation.bracket", pushState("block"))],
    urlAtoms: [lessInterpolation, lessVariable],
    prelude: lessAtoms,
    preludeGroup: lessAtoms,
    states({ valueAtoms, selectorAtoms }): Record<string, State> {
      return {
        scssLineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
        lessInterpolation: {
          style: "plain",
          arms: [
            token("}", "punctuation.special", popState()),
            lessVariable,
            on(start, ...ident, paint("variable")),
          ],
        },
        lessClassName: {
          style: "plain",
          arms: [lessInterpolation, on(start, ...ident, paint("property"))],
          otherwise: [popState()],
        },
        lessJavaScript: {
          style: "string",
          arms: [
            lessInterpolation,
            on("\\", literal("\\"), character(), paint("string.escape")),
            token("`", "string", popState()),
          ],
        },
        lessProperty: {
          style: "property",
          arms: [
            lessInterpolation,
            on(start, ...ident, paint("property")),
            token(":", "punctuation.delimiter", setState("afterProperty"), pushState("value")),
            redispatch(";}", popState()),
          ],
        },
        lessBareMixinName: {
          style: "plain",
          arms: [
            on(start, ...ident, paint("function"), setState("lessBareMixinTail")),
            on(
              "@",
              literal("@{"),
              paint("punctuation.special"),
              setState("lessBareMixinTail"),
              pushState("lessInterpolation"),
            ),
          ],
          otherwise: [popState()],
        },
        lessBareMixinTail: {
          style: "plain",
          arms: [
            token(";", "punctuation.delimiter", popState()),
            redispatch("}", popState()),
            on(
              "!",
              literal("!"),
              bytes(space, { min: 0 }),
              ...insensitive("important"),
              notNext(rest),
              paint("keyword"),
            ),
            on(
              ".#",
              byte(".#"),
              lookahead(choice(ident, lessInterpolationFragment)),
              paint("punctuation.delimiter"),
              pushState("lessBareMixinMember"),
            ),
            token("(", "punctuation.bracket", pushState("lessMixinGroup")),
            ...selectorAtoms,
          ],
        },
        lessBareMixinMember: {
          style: "plain",
          arms: [lessInterpolation, on(start, ...ident, paint("function"), popState())],
          otherwise: [popState()],
        },
        lessMixinName: {
          style: "plain",
          arms: [on(start, ...ident, paint("function"), setState("lessMixinPrelude"))],
          otherwise: [popState()],
        },
        lessMixinPrelude: {
          style: "plain",
          arms: [
            token(";", "punctuation.delimiter", popState()),
            token("{", "punctuation.bracket", setState("block")),
            redispatch("}", popState()),
            ...["when", "and", "not"].map((word) =>
              on(word[0]!, literal(word), notNext(rest), paint("keyword")),
            ),
            token("(", "punctuation.bracket", pushState("lessMixinGroup")),
            ...valueAtoms,
          ],
        },
        lessMixinGroup: {
          style: "plain",
          arms: [
            token(")", "punctuation.bracket", popState()),
            token("(", "punctuation.bracket", pushState("lessMixinGroup")),
            token(";", "punctuation.delimiter"),
            redispatch("}", popState()),
            ...valueAtoms,
          ],
        },
      };
    },
  };
}

export function css(dialect: Dialect) {
  const extension = {
    css: emptyExtension,
    scss: scssExtension,
    less: lessExtension,
  }[dialect]();

  const other = except(anyByte, extension.blockDelimiters);
  const beforeBlock = repeat(
    choice(
      [bytes(other)],
      ...extension.blockFragments,
      [literal("/"), notNext(extension.slashFollowers)],
      [
        literal('"'),
        repeat(choice([literal("\\"), character()], [byte(doubleContent)])),
        literal('"'),
      ],
      [
        literal("'"),
        repeat(choice([literal("\\"), character()], [byte(singleContent)])),
        literal("'"),
      ],
      [
        literal("/*"),
        repeat(choice([byte(commentContent)], [literal("*"), notNext("/")])),
        literal("*/"),
      ],
    ),
  );
  const makeValueAtoms = (context: "declaration" | "prelude") => [
    comment,
    ...valueStrings,
    ...(context === "declaration" ? [colorHex] : []),
    on("#", literal("#"), bytes(hex), paint("string")),
    on("-", lookahead(literal("--")), ...ident, paint("variable")),
    number,
    ...extension.valueMinus,
    unicodeRange,
    url,
    on(
      start,
      ...ident,
      lookahead(literal("(")),
      context === "declaration"
        ? classify(colorCalls, [paint("function")], { caseless: true })
        : paint("function"),
    ),
    ...(context === "declaration"
      ? brackets
      : [token("(", "punctuation.bracket", pushState("preludeValueGroup"))]),
    on(
      "!",
      literal("!"),
      bytes(space, { min: 0 }),
      ...insensitive("important"),
      notNext(rest),
      paint("keyword"),
    ),
    on(
      start,
      ...ident,
      context === "declaration"
        ? classify(namedColors, [paint("plain")], { caseless: true })
        : paint("plain"),
    ),
    token(oneOf(",:;"), "punctuation.delimiter"),
    token(oneOf("+-*/=<>"), "operator"),
  ];
  const valueAtoms = [...extension.valueAtoms, ...makeValueAtoms("declaration")];
  const preludeValueAtoms =
    extension.preludeValuesMode === "colored"
      ? valueAtoms
      : [...extension.valueAtoms, ...makeValueAtoms("prelude")];
  const selectorAtoms = [
    ...extension.selectorAtoms,
    comment,
    ...strings,
    token(".", "punctuation.delimiter", pushState(extension.classState)),
    token("#", "punctuation.delimiter", pushState(extension.classState)),
    token("::", "punctuation.delimiter", pushState("pseudoName")),
    token(":", "punctuation.delimiter", pushState("pseudoName")),
    token("[", "punctuation.bracket", pushState("attributeSelector")),
    token("(", "punctuation.bracket", pushState("selectorGroup")),
    token("*", "tag"),
    ...extension.parentSelectors,
    token("&", "tag"),
    token(oneOf(">+~|"), "operator"),
    token(",", "punctuation.delimiter"),
    on(start, ...ident, paint("tag")),
  ];
  const declarations = [
    ...extension.declarations,
    on(
      "-",
      lookahead(literal("--")),
      ...ident,
      lookahead(bytes(space, { min: 0 }), literal(":")),
      paint("variable"),
      pushState("afterCustomProperty"),
    ),
    on(
      start,
      ...ident,
      lookahead(bytes(space, { min: 0 }), literal(":"), beforeBlock, literal("{")),
      paint("tag"),
    ),
    on(
      start,
      ...ident,
      lookahead(bytes(space, { min: 0 }), literal(":")),
      paint("property"),
      pushState("afterProperty"),
    ),
  ];

  const stringState = (quote: '"' | "'", context: "value" | "normal"): State => ({
    style: "string",
    arms: [
      ...extension.stringInterpolation,
      on("\\", ...escape, paint("string.escape")),
      token(quote, "string", popState()),
      redispatch("\n\r\f", context === "value" ? setState("badValue") : popState()),
    ],
  });

  return defineGrammar<string>({
    name: dialect,
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          ...keyframes,
          ...extension.rules,
          atRule,
          token("{", "punctuation.bracket", pushState("block")),
          ...declarations,
          ...selectorAtoms,
        ],
      },
      block: {
        style: "plain",
        arms: [
          comment,
          ...keyframes,
          ...extension.rules,
          atRule,
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("block")),
          ...declarations,
          ...extension.bareMixins(beforeBlock),
          ...selectorAtoms,
        ],
      },
      afterProperty: {
        style: "plain",
        arms: [
          ...extension.lineComments,
          comment,
          token(":", "punctuation.delimiter", pushState("value")),
          redispatch(";}", popState()),
        ],
      },
      afterCustomProperty: {
        style: "plain",
        arms: [
          comment,
          token(":", "punctuation.delimiter", pushState("customValue")),
          redispatch(";}", popState()),
        ],
      },
      customValue: {
        style: "plain",
        arms: [
          token(";", "punctuation.delimiter", popState(), popState()),
          redispatch("}", popState(), popState()),
          token("{", "punctuation.bracket", pushState("customBlock")),
          ...valueAtoms,
        ],
      },
      customBlock: {
        style: "plain",
        arms: [
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("customBlock")),
          ...valueAtoms,
        ],
      },
      value: {
        style: "plain",
        arms: [
          token(";", "punctuation.delimiter", popState(), popState()),
          redispatch("}", popState(), popState()),
          ...extension.valueBlocks,
          ...valueAtoms,
        ],
      },
      valueGroup: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", popState()),
          redispatch(";}", popState()),
          ...valueAtoms,
        ],
      },
      colorOpen: {
        style: "plain",
        arms: [token("(", "punctuation.bracket", setState("colorBody"))],
      },
      colorBody: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", wrap("constant.color"), popState()),
          redispatch(";}", popState()),
          ...valueAtoms,
        ],
      },
      urlOpen: {
        style: "plain",
        arms: [token("(", "punctuation.bracket", setState("urlBody"))],
        otherwise: [popState()],
      },
      urlBody: {
        style: "string",
        arms: [
          token(")", "punctuation.bracket", popState()),
          ...extension.urlAtoms,
          ...strings,
          on("\\", ...escape, paint("string.escape")),
          on(
            ";",
            literal(";"),
            lookahead(bytes(urlTail, { min: 0 }), literal(")")),
            paint("string"),
          ),
          redispatch("\n\r\f;}", popState()),
        ],
      },
      unit: {
        style: "plain",
        arms: [token("%", "type", popState()), on(start, ...ident, paint("type"), popState())],
        otherwise: [popState()],
      },
      className: {
        style: "plain",
        arms: [on(start, ...ident, paint("property"), popState())],
        otherwise: [popState()],
      },
      pseudoName: {
        style: "plain",
        arms: [on(start, ...ident, paint("attribute"), popState())],
        otherwise: [popState()],
      },
      selectorGroup: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", popState()),
          redispatch("{};", popState()),
          number,
          ...selectorAtoms,
        ],
      },
      attributeSelector: {
        style: "plain",
        arms: [
          token("]", "punctuation.bracket", popState()),
          redispatch("{};", popState()),
          comment,
          ...strings,
          ...["~=", "|=", "^=", "$=", "*=", "="].map((op) =>
            token(op, "operator", pushState("attributeValue")),
          ),
          on(start, ...ident, paint("attribute")),
        ],
      },
      attributeValue: {
        style: "plain",
        arms: [
          token('"', "string", setState("attributeAfterValue"), pushState("doubleString")),
          token("'", "string", setState("attributeAfterValue"), pushState("singleString")),
          on(start, ...ident, paint("string"), setState("attributeAfterValue")),
          redispatch("]{};", popState()),
        ],
      },
      attributeAfterValue: {
        style: "plain",
        arms: [comment, on(start, ...ident, paint("plain")), redispatch("]{};", popState())],
      },
      keyframesPrelude: {
        style: "plain",
        arms: [
          comment,
          token("{", "punctuation.bracket", setState("keyframesBlock")),
          redispatch(";}", popState()),
        ],
      },
      keyframesBlock: {
        style: "plain",
        arms: [
          comment,
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("block")),
          number,
          ...words(["from", "to"], "keyword"),
          on(start, ...ident, paint("plain")),
          token(",", "punctuation.delimiter"),
        ],
      },
      prelude: {
        style: "plain",
        arms: [
          ...extension.prelude,
          token(";", "punctuation.delimiter", popState()),
          token("{", "punctuation.bracket", setState("block")),
          redispatch("}", popState()),
          comment,
          ...strings,
          token("(", "punctuation.bracket", pushState("preludeGroup")),
          number,
          url,
          on(start, ...ident, lookahead(literal("(")), paint("function")),
          ...mediaOperators,
          ...extension.preludeValues(valueAtoms),
          on(start, ...ident, paint("plain")),
          token(oneOf(",:"), "punctuation.delimiter"),
        ],
      },
      preludeValueGroup: {
        style: "plain",
        arms: [
          token(")", "punctuation.bracket", popState()),
          redispatch(";}", popState()),
          ...preludeValueAtoms,
        ],
      },
      preludeGroup: {
        style: "plain",
        arms: [
          ...extension.preludeGroup,
          token(")", "punctuation.bracket", popState()),
          redispatch("{};", popState()),
          on(start, ...ident, lookahead(bytes(space, { min: 0 }), byte(":<>=")), paint("property")),
          on(start, ...ident, lookahead(literal("(")), paint("function")),
          ...mediaOperators,
          ...preludeValueAtoms,
        ],
      },
      ...extension.states({ valueAtoms, selectorAtoms }),
      comment: { style: "comment", arms: [token("*/", "comment", popState())] },
      badValue: {
        style: "plain",
        arms: [redispatch(";}", popState()), ...badValueAtoms],
      },
      badParen: {
        style: "plain",
        arms: [token(")", "plain", popState()), redispatch("}", popState()), ...badValueAtoms],
      },
      badBracket: {
        style: "plain",
        arms: [token("]", "plain", popState()), redispatch("}", popState()), ...badValueAtoms],
      },
      badBrace: {
        style: "plain",
        arms: [token("}", "plain", popState()), ...badValueAtoms],
      },
      badComment: { style: "plain", arms: [token("*/", "plain", popState())] },
      badDoubleString: {
        style: "plain",
        arms: [
          on("\\", ...escape, paint("plain")),
          token('"', "plain", popState()),
          redispatch("\n\r\f", popState()),
        ],
      },
      badSingleString: {
        style: "plain",
        arms: [
          on("\\", ...escape, paint("plain")),
          token("'", "plain", popState()),
          redispatch("\n\r\f", popState()),
        ],
      },
      doubleValueString: stringState('"', "value"),
      singleValueString: stringState("'", "value"),
      doubleString: stringState('"', "normal"),
      singleString: stringState("'", "normal"),
    },
  });
}
