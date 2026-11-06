import {
  byte,
  bytes,
  byteSet,
  choice,
  closeInjection,
  defineGrammar,
  except,
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
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const identifierPunctuation = byteSet({ bytes: [95, 36] });
const word = union(alpha, digit, identifierPunctuation);
const tagName = except(all, space + "/>='\"<{}");
const attrName = except(all, space + "/>='\"<{}:|");
const normalAttrName = except(all, space + "/>='\"<{}");
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
  openInjection({ static: "javascript" }),
  pushState("expr_start"),
);
const comment = token("<!--", "comment", pushState("htmlComment"));
states.htmlComment = { style: "comment", arms: [token("-->", "comment", popState())] };
states.declaration = { style: "keyword", arms: [token(">", "keyword", popState())] };

// The host tracks lexical boundaries while JavaScript styles the same bytes.
for (const nested of [false, true])
  for (const expected of [false, true]) {
    const state = nested ? "inner" : "expr";
    const start = `${state}_start`,
      after = `${state}_after`;
    const arms: Arm[] = [
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
      ...[
        "return",
        "throw",
        "typeof",
        "void",
        "delete",
        "new",
        "in",
        "instanceof",
        "yield",
        "await",
      ].map((w) => on(w[0]!, literal(w), notNext(word), paint("plain"), setState(start))),
      on(union(alpha, identifierPunctuation), bytes(word), paint("plain"), setState(after)),
      on(digit, bytes(union(word, byteSet({ bytes: [46] }))), paint("plain"), setState(after)),
      token("++", "plain", setState(expected ? start : after)),
      token("--", "plain", setState(expected ? start : after)),
      ...(expected
        ? [token("/", "plain", setState(after), pushState("regex"))]
        : [token("/", "plain", setState(start))]),
      on(")]", byte(")]"), paint("plain"), setState(after)),
      on("([,;:?=!*%&|^~+-<>", byte("([,;:?=!*%&|^~+-<>"), paint("plain"), setState(start)),
    ];
    states[`${state}_${expected ? "start" : "after"}`] = { style: "plain", arms };
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

states.blockName = {
  style: "plain",
  arms: [
    on(alpha, bytes(alpha), paint("keyword"), setState("blockRest")),
    token("}", "punctuation.special", popState()),
  ],
};
states.blockRest = {
  style: "plain",
  arms: [
    on(space, bytes(space), paint("plain")),
    token("}", "punctuation.special", popState()),
    on("i", literal("if"), notNext(word), paint("keyword")),
  ],
  otherwise: [openInjection({ static: "javascript" }), setState("expr_start")],
};
const block = on(
  "{",
  literal("{"),
  byte("#:@"),
  paint("punctuation.special"),
  pushState("blockName"),
);

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
    on(
      "{",
      literal("{"),
      paint("punctuation.special"),
      openInjection({ static: "javascript" }),
      setState("expr_start"),
    ),
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
states.directiveTail = {
  style: "plain",
  arms: [
    token(":", "punctuation.special", setState("directiveArgument")),
    token("|", "punctuation.special", setState("directiveModifier")),
  ],
  otherwise: [setState("afterAttribute")],
};
states.directiveArgument = {
  style: "plain",
  arms: [on(attrName, bytes(attrName), paint("property"), setState("directiveTail"))],
  otherwise: [setState("directiveTail")],
};
states.directiveModifier = {
  style: "plain",
  arms: [on(attrName, bytes(attrName), paint("label"), setState("directiveTail"))],
  otherwise: [setState("directiveTail")],
};
const attributes: Arm[] = [
  on(space, bytes(space), paint("plain")),
  expression,
  ...["on", "bind", "class", "style", "use", "transition", "in", "out", "animate", "let"].map(
    (name) =>
      on(
        name[0]!,
        literal(name),
        lookahead(literal(":")),
        paint("attribute"),
        pushState("directiveTail"),
      ),
  ),
  on(normalAttrName, bytes(normalAttrName), paint("attribute"), pushState("afterAttribute")),
];
states.root = {
  style: "plain",
  arms: [
    comment,
    token("<!", "keyword", pushState("declaration")),
    block,
    on(
      "{",
      literal("{/"),
      lookahead(
        choice(...["if", "each", "await", "key", "snippet"].map((name) => [literal(name)])),
        bytes(space, { min: 0 }),
        literal("}"),
      ),
      paint("punctuation.special"),
      pushState("blockName"),
    ),
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
  arms: [on(tagName, bytes(tagName), paint("tag"), setState("htmlTag"))],
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
    initial: "javascript",
    kinds: ["javascript", "typescript", "plain"],
    values: [
      ["js", "javascript"],
      ["javascript", "javascript"],
      ["ts", "typescript"],
      ["typescript", "typescript"],
    ],
  },
  {
    tag: "style",
    initial: "css",
    kinds: ["css", "scss", "plain"],
    values: [
      ["css", "css"],
      ["scss", "scss"],
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
export default defineGrammar({ name: "svelte", initial: "root", states });
