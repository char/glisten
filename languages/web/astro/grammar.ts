import {
  byte,
  bytes,
  byteSet,
  choice,
  closeInjection,
  defineGrammar,
  except,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
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
  type Arm,
  type Matcher,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const space = " \t\r\n\f";
const alpha = union(range("a", "z"), range("A", "Z"));
const upper = range("A", "Z");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union(alpha, "_$", byteSet({ ranges: [[128, 255]] }));
const word = union(start, digit);
const tagName = except(all, space + "/>='\"<{}");
const attrName = except(all, space + "/>='\"<{}:");
const boundary = space + "/>";
const insensitive = (text: string): Matcher[] =>
  [...text].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const named = (text: string) => lookahead(...insensitive(text), byte(boundary));
const valueIs = (text: string) =>
  choice(
    [literal('"'), literal(text), literal('"')],
    [literal("'"), literal(text), literal("'")],
    [literal(text), lookahead(byte(boundary))],
  );
const reference = on(
  "&",
  literal("&"),
  choice(
    [literal("#"), byte("xX"), bytes(hex), optional(literal(";"))],
    [literal("#"), bytes(digit), optional(literal(";"))],
    [byte(alpha), bytes(union(alpha, digit), { min: 0 }), optional(literal(";"))],
  ),
  paint("string.escape"),
);
const states: Record<string, State> = {};
const expression = token(
  "{",
  "punctuation.special",
  openInjection({ static: "tsx" }),
  pushState("expr_start"),
);
const comment = token("<!--", "comment", pushState("htmlComment"));
states.htmlComment = { style: "comment", arms: [token("-->", "comment", popState())] };
states.declaration = { style: "keyword", arms: [token(">", "keyword", popState())] };

const genericText = except(range(" ", "~"), "<>()=;");
const genericBody = (depth: number): ReturnType<typeof repeat> =>
  repeat(
    choice(
      [bytes(genericText)],
      ...(depth ? [[literal("<"), genericBody(depth - 1), literal(">")]] : []),
    ),
  );
const genericHead = [
  bytes(" \t", { min: 0 }),
  lookahead(byte(start), bytes(word, { min: 0 })),
  genericBody(3),
  literal(">"),
];

// The parent must find the closing brace independently of the injected TSX lexer.
for (const context of ["expression", "nested"] as const)
  for (const position of ["after", "start"] as const) {
    const nested = context === "nested";
    const expected = position === "start";
    const state = nested ? "inner" : "expr";
    const first = `${state}_start`,
      after = `${state}_after`;
    states[`${state}_${expected ? "start" : "after"}`] = {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token("//", "plain", pushState("lineComment")),
        token("/*", "plain", pushState("blockComment")),
        token('"', "plain", setState(after), pushState("doubleString")),
        token("'", "plain", setState(after), pushState("singleString")),
        token("`", "plain", setState(after), pushState("templateString")),
        token("{", "plain", setState(after), pushState("inner_start")),
        nested
          ? token("}", "plain", popState())
          : on("}", literal("}"), closeInjection(), paint("punctuation.special"), popState()),
        ...`
            return throw typeof void delete new in instanceof yield await
          `
          .trim()
          .split(/\s+/)
          .map((w) => on(w[0]!, literal(w), notNext(word), paint("plain"), setState(first))),
        ...(expected
          ? [
              on(
                "<",
                literal("<"),
                lookahead(...genericHead, bytes(" \t", { min: 0 }), literal("(")),
                paint("plain"),
                pushState("angle"),
              ),
              on(
                "<",
                literal("<"),
                lookahead(byte(union(start, ">"))),
                paint("plain"),
                setState(after),
                pushState("jsxOpen"),
              ),
            ]
          : []),
        on(start, bytes(word), paint("plain"), setState(after)),
        on(digit, bytes(union(word, ".")), paint("plain"), setState(after)),
        token("++", "plain", setState(expected ? first : after)),
        token("--", "plain", setState(expected ? first : after)),
        expected
          ? token("/", "plain", setState(after), pushState("regex"))
          : token("/", "plain", setState(first)),
        on(")]", byte(")]"), paint("plain"), setState(after)),
        on("([,;:?=!*%&|^~+-<>", byte("([,;:?=!*%&|^~+-<>"), paint("plain"), setState(first)),
      ],
    };
  }
states.doubleString = {
  style: "plain",
  arms: [on("\\", literal("\\"), byte(all), paint("plain")), token('"', "plain", popState())],
};
states.singleString = {
  style: "plain",
  arms: [on("\\", literal("\\"), byte(all), paint("plain")), token("'", "plain", popState())],
};
states.templateString = {
  style: "plain",
  arms: [
    on("\\", literal("\\"), byte(all), paint("plain")),
    token("${", "plain", pushState("inner_start")),
    token("`", "plain", popState()),
  ],
};
states.lineComment = {
  style: "plain",
  arms: [on("\r\n", byte("\r\n"), paint("plain"), popState())],
};
states.blockComment = { style: "plain", arms: [token("*/", "plain", popState())] };
states.regex = {
  style: "plain",
  arms: [
    on("\\", literal("\\"), byte(all), paint("plain")),
    token("[", "plain", pushState("regexClass")),
    token("/", "plain", popState()),
    redispatch("\r\n", popState()),
  ],
};
states.regexClass = {
  style: "plain",
  arms: [
    on("\\", literal("\\"), byte(all), paint("plain")),
    token("]", "plain", popState()),
    redispatch("\r\n", popState()),
  ],
};
states.angle = {
  style: "plain",
  arms: [token("<", "plain", pushState("angle")), token(">", "plain", popState())],
};
states.jsxOpen = {
  style: "plain",
  arms: [
    token(">", "plain", setState("jsxChildren")),
    on(start, bytes(union(word, "-:.")), paint("plain"), setState("jsxAttributes")),
  ],
};
states.jsxAttributes = {
  style: "plain",
  arms: [
    token("/>", "plain", popState()),
    token(">", "plain", setState("jsxChildren")),
    token("{", "plain", pushState("inner_start")),
    token('"', "plain", pushState("jsxDouble")),
    token("'", "plain", pushState("jsxSingle")),
    token("<", "plain", pushState("angle")),
  ],
};
states.jsxChildren = {
  style: "plain",
  arms: [
    token("</", "plain", setState("jsxClose")),
    token("<", "plain", pushState("jsxOpen")),
    token("{", "plain", pushState("inner_start")),
  ],
};
states.jsxClose = { style: "plain", arms: [token(">", "plain", popState())] };
states.jsxDouble = { style: "plain", arms: [token('"', "plain", popState())] };
states.jsxSingle = { style: "plain", arms: [token("'", "plain", popState())] };

states.afterAttribute = {
  style: "plain",
  arms: [
    on(space, bytes(space), lookahead(literal("=")), paint("plain")),
    token("=", "operator", setState("attributeValue")),
  ],
  otherwise: [popState()],
};
states.attributeValue = {
  style: "plain",
  arms: [
    on(space, bytes(space), paint("plain")),
    token('"', "string", setState("attributeDouble")),
    token("'", "string", setState("attributeSingle")),
    token("{", "punctuation.special", openInjection({ static: "tsx" }), setState("expr_start")),
    redispatch(">", popState()),
  ],
  otherwise: [setState("attributeUnquoted")],
};
states.attributeDouble = {
  style: "string",
  arms: [reference, expression, token('"', "string", popState())],
};
states.attributeSingle = {
  style: "string",
  arms: [reference, expression, token("'", "string", popState())],
};
states.attributeUnquoted = {
  style: "string",
  arms: [reference, expression, redispatch(space + ">", popState())],
};
states.directiveArgument = {
  style: "plain",
  arms: [
    token(":", "punctuation.special"),
    on(attrName, bytes(attrName), paint("property"), setState("afterAttribute")),
  ],
  otherwise: [setState("afterAttribute")],
};
const attributes: Arm[] = [
  on(space, bytes(space), paint("plain")),
  expression,
  ...["client", "server", "set", "is", "define", "class", "style", "transition"].map((name) =>
    on(
      name[0]!,
      literal(name),
      lookahead(literal(":")),
      paint("attribute"),
      pushState("directiveArgument"),
    ),
  ),
  on(attrName, bytes(attrName), paint("attribute"), pushState("afterAttribute")),
  token(":", "punctuation.special"),
];
states.start = {
  style: "plain",
  arms: [
    on(
      "-",
      literal("---"),
      bytes(" \t", { min: 0 }),
      optional(literal("\r")),
      literal("\n"),
      paint("punctuation.special"),
      openInjection({ static: "typescript" }),
      setState("frontmatter"),
    ),
  ],
  otherwise: [setState("root")],
};
states.frontmatter = {
  style: "plain",
  arms: [
    on(
      "-",
      lineStart(),
      literal("---"),
      bytes(" \t", { min: 0 }),
      optional(literal("\r")),
      lineEnd(),
      closeInjection(),
      paint("punctuation.special"),
      setState("root"),
    ),
  ],
};
states.root = {
  style: "plain",
  arms: [
    comment,
    token("<!", "keyword", pushState("declaration")),
    expression,
    on("<", literal("<"), named("script"), paint("punctuation.bracket"), pushState("scriptName")),
    on("<", literal("<"), named("style"), paint("punctuation.bracket"), pushState("styleName")),
    on(
      "<",
      literal("</"),
      lookahead(byte(tagName)),
      paint("punctuation.bracket"),
      pushState("htmlName"),
    ),
    on(
      "<",
      literal("<"),
      lookahead(byte(tagName)),
      paint("punctuation.bracket"),
      pushState("htmlName"),
    ),
    reference,
  ],
};
states.htmlName = {
  style: "plain",
  arms: [
    on(upper, byte(upper), bytes(tagName, { min: 0 }), paint("type"), setState("htmlTag")),
    on(tagName, bytes(tagName), paint("tag"), setState("htmlTag")),
  ],
};
states.htmlTag = {
  style: "plain",
  arms: [
    token("/>", "punctuation.bracket", popState()),
    token(">", "punctuation.bracket", popState()),
    ...attributes,
  ],
};
for (const definition of [
  {
    tag: "script",
    initial: "typescript",
    kinds: ["typescript", "plain"],
    values: [
      ["ts", "typescript"],
      ["typescript", "typescript"],
      ["js", "typescript"],
      ["javascript", "typescript"],
    ],
  },
  {
    tag: "style",
    initial: "css",
    kinds: ["css", "scss", "less", "plain"],
    values: [
      ["css", "css"],
      ["scss", "scss"],
      ["less", "less"],
    ],
  },
] as const) {
  const { tag } = definition;
  states[`${tag}Name`] = {
    style: "plain",
    arms: [on(tagName, bytes(tagName), paint("tag"), setState(`${tag}Tag_${definition.initial}`))],
  };
  for (const lang of definition.kinds) {
    const langArms = definition.values.map(([value, selected]) =>
      on(
        "lL",
        ...insensitive("lang"),
        notNext(attrName),
        lookahead(bytes(space, { min: 0 }), literal("="), bytes(space, { min: 0 }), valueIs(value)),
        paint("attribute"),
        setState(`${tag}Tag_${selected}`),
        pushState("afterAttribute"),
      ),
    );
    langArms.push(
      on(
        "lL",
        ...insensitive("lang"),
        notNext(attrName),
        lookahead(bytes(space, { min: 0 }), literal("=")),
        paint("attribute"),
        setState(`${tag}Tag_plain`),
        pushState("afterAttribute"),
      ),
    );
    states[`${tag}Tag_${lang}`] = {
      style: "plain",
      arms: [
        token("/>", "punctuation.bracket", popState()),
        token(
          ">",
          "punctuation.bracket",
          ...(lang === "plain" ? [] : [openInjection({ static: lang })]),
          setState(`${tag}Body_${lang}`),
        ),
        ...langArms,
        ...attributes,
      ],
    };
    states[`${tag}Body_${lang}`] = {
      style: "plain",
      arms: [
        on(
          "<",
          literal("</"),
          named(tag),
          ...(lang === "plain" ? [] : [closeInjection()]),
          paint("punctuation.bracket"),
          setState("closeName"),
        ),
      ],
    };
  }
}
states.closeName = {
  style: "plain",
  arms: [on(tagName, bytes(tagName), paint("tag"), setState("closeEnd"))],
};
states.closeEnd = {
  style: "plain",
  arms: [on(space, bytes(space), paint("plain")), token(">", "punctuation.bracket", popState())],
};
export default defineGrammar({ name: "astro", initial: "start", states });
