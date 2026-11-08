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
} from "#/grammar/mod.ts";

export function css(mode: boolean | "less") {
  const scss = mode === true;
  const less = mode === "less";
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
  const other = except(anyByte, less ? "{};\"'/@" : "{};\"'/");
  const doubleContent = except(anyByte, '"\\\n\r\f');
  const singleContent = except(anyByte, "'\\\n\r\f");
  const commentContent = except(anyByte, "*");
  const beforeBlock = repeat(
    choice(
      [bytes(other)],
      ...(less
        ? [
            [literal("@{"), bytes(except(anyByte, "}"), { min: 0 }), literal("}")],
            [literal("@"), notNext("{")],
          ]
        : []),
      ...(less ? [[literal("//"), bytes(except(anyByte, "\r\n"), { min: 0 })]] : []),
      [literal("/"), notNext(less ? "*/" : "*")],
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
  const urlTail = except(byteSet({ ranges: [[0, 255]] }), ")}\n\r\f");
  const space = " \t\r\n\f";
  const insensitive = (word: string) =>
    [...word].map((c) => byte(c.toLowerCase() + c.toUpperCase()));
  const words = (items: readonly string[], style: "operator" | "keyword") =>
    items.map((word) =>
      on(word[0]! + word[0]!.toUpperCase(), ...insensitive(word), notNext(rest), paint(style)),
    );
  const mediaOperators = words(["and", "or", "not", "only"], "operator");
  const comment = token("/*", "comment", pushState("comment"));
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
      ...Array.from({ length: 6 }, (_, i) => {
        const count = 5 - i;
        return count
          ? [bytes(hex, { min: count, max: count }), bytes("?", { min: 1, max: 6 - count })]
          : [bytes("?", { min: 1, max: 6 })];
      }),
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
  const colorFunctions = [
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "color-mix",
    "light-dark",
  ];
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
  const makeValueAtoms = (colors: boolean) => [
    comment,
    ...valueStrings,
    ...(colors ? [colorHex] : []),
    on("#", literal("#"), bytes(hex), paint("string")),
    on("-", lookahead(literal("--")), ...ident, paint("variable")),
    number,
    ...(scss || less ? [on("-", literal("-"), notNext(rest), paint("operator"))] : []),
    unicodeRange,
    url,
    on(
      start,
      ...ident,
      lookahead(literal("(")),
      colors ? classify(colorCalls, [paint("function")], { caseless: true }) : paint("function"),
    ),
    ...(colors ? brackets : [token("(", "punctuation.bracket", pushState("preludeValueGroup"))]),
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
      colors ? classify(namedColors, [paint("plain")], { caseless: true }) : paint("plain"),
    ),
    token(oneOf(",:;"), "punctuation.delimiter"),
    token(oneOf("+-*/=<>"), "operator"),
  ];
  const interpolation = token("#{", "punctuation.special", pushState("scssInterpolation"));
  const variable = on("$", literal("$"), ...ident, paint("variable"));
  const lineComment = token("//", "comment", pushState("scssLineComment"));
  const scssAtoms = [lineComment, interpolation, variable];
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
  const namespacedCall = on(
    start,
    ...ident,
    literal("."),
    ...ident,
    lookahead(literal("(")),
    paint("function"),
  );
  const scssValueAtoms = scss
    ? [
        ...scssAtoms,
        namespacedCall,
        on(
          "!",
          literal("!"),
          choice([literal("default")], [literal("global")]),
          notNext(rest),
          paint("keyword"),
        ),
      ]
    : [];
  const valueAtoms = [
    ...scssValueAtoms,
    ...(less ? [...lessAtoms, token(oneOf("[]"), "punctuation.bracket")] : []),
    ...makeValueAtoms(true),
  ];
  const preludeValueAtoms = scss
    ? valueAtoms
    : less
      ? [...lessAtoms, token(oneOf("[]"), "punctuation.bracket"), ...makeValueAtoms(false)]
      : makeValueAtoms(false);
  const selectorAtoms = [
    ...(scss ? [...scssAtoms, on("%", literal("%"), ...ident, paint("tag"))] : []),
    ...(less ? [lessMixin, ...lessAtoms] : []),
    comment,
    ...strings,
    token(".", "punctuation.delimiter", pushState(less ? "lessClassName" : "className")),
    token("#", "punctuation.delimiter", pushState(less ? "lessClassName" : "className")),
    token("::", "punctuation.delimiter", pushState("pseudoName")),
    token(":", "punctuation.delimiter", pushState("pseudoName")),
    token("[", "punctuation.bracket", pushState("attributeSelector")),
    token("(", "punctuation.bracket", pushState("selectorGroup")),
    token("*", "tag"),
    ...(less
      ? [
          on(
            "&",
            literal("&"),
            lookahead(choice([literal("-")], [literal("@{")])),
            paint("tag"),
            pushState("lessClassName"),
          ),
        ]
      : []),
    token("&", "tag"),
    token(oneOf(">+~|"), "operator"),
    token(",", "punctuation.delimiter"),
    on(start, ...ident, paint("tag")),
  ];
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
  const declarations = [
    ...(scss
      ? [
          on(
            "$",
            literal("$"),
            ...ident,
            lookahead(bytes(space, { min: 0 }), literal(":")),
            paint("variable"),
            pushState("afterProperty"),
          ),
          dynamicProperty,
        ]
      : []),
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

  return defineGrammar<string>({
    name: less ? "less" : scss ? "scss" : "css",
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          ...keyframes,
          ...(scss ? callableRules : []),
          ...(less ? lessDeclarations : []),
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
          ...(scss ? callableRules : []),
          ...(less ? lessDeclarations : []),
          atRule,
          token("}", "punctuation.bracket", popState()),
          token("{", "punctuation.bracket", pushState("block")),
          ...declarations,
          ...(less ? [lessBareMixin] : []),
          ...selectorAtoms,
        ],
      },
      afterProperty: {
        style: "plain",
        arms: [
          ...(scss || less ? [lineComment] : []),
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
          ...(less ? [token("{", "punctuation.bracket", pushState("block"))] : []),
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
          ...(less ? [lessInterpolation, lessVariable] : []),
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
          ...(less ? lessAtoms : []),
          ...(scss
            ? [
                ...scssAtoms,
                namespacedCall,
                ...words(["as", "with", "if", "in", "from", "through", "to"], "keyword"),
              ]
            : []),
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
          ...(scss
            ? [on("%", literal("%"), ...ident, paint("tag")), ...valueAtoms, token("!", "operator")]
            : []),
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
          ...(less ? lessAtoms : []),
          ...(scss
            ? [
                ...scssAtoms,
                namespacedCall,
                ...words(["as", "with", "in", "from", "through", "to"], "keyword"),
              ]
            : []),
          token(")", "punctuation.bracket", popState()),
          redispatch("{};", popState()),
          on(start, ...ident, lookahead(bytes(space, { min: 0 }), byte(":<>=")), paint("property")),
          on(start, ...ident, lookahead(literal("(")), paint("function")),
          ...mediaOperators,
          ...preludeValueAtoms,
        ],
      },
      ...(scss
        ? {
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
          }
        : {}),
      ...(less
        ? {
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
          }
        : {}),
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
      doubleValueString: {
        style: "string",
        arms: [
          ...(scss ? [interpolation] : less ? [lessInterpolation] : []),
          on("\\", ...escape, paint("string.escape")),
          token('"', "string", popState()),
          redispatch("\n\r\f", setState("badValue")),
        ],
      },
      singleValueString: {
        style: "string",
        arms: [
          ...(scss ? [interpolation] : less ? [lessInterpolation] : []),
          on("\\", ...escape, paint("string.escape")),
          token("'", "string", popState()),
          redispatch("\n\r\f", setState("badValue")),
        ],
      },
      doubleString: {
        style: "string",
        arms: [
          ...(scss ? [interpolation] : less ? [lessInterpolation] : []),
          on("\\", ...escape, paint("string.escape")),
          token('"', "string", popState()),
          redispatch("\n\r\f", popState()),
        ],
      },
      singleString: {
        style: "string",
        arms: [
          ...(scss ? [interpolation] : less ? [lessInterpolation] : []),
          on("\\", ...escape, paint("string.escape")),
          token("'", "string", popState()),
          redispatch("\n\r\f", popState()),
        ],
      },
    },
  });
}
