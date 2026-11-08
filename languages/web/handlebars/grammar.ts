import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
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
  shell,
  token,
  union,
  type Arm,
  type Effect,
  type Matcher,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const space = " \t\r\n\f";
const alpha = union(range("a", "z"), range("A", "Z"));
const upper = range("A", "Z");
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const tagName = except(all, space + "/>='\"<{}");
const attrName = tagName;
const path = except(all, space + "(){}'\"=|~");
const name = except(path, ",");
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
const escape = (style: "plain" | "string" | "comment") => [
  token("\\\\", style),
  token("\\{{", style),
];
const mustache: Arm[] = [
  on(
    "{",
    literal("{{"),
    optional(literal("~")),
    literal("!--"),
    paint("comment"),
    pushState("longComment"),
  ),
  on(
    "{",
    literal("{{"),
    optional(literal("~")),
    literal("!"),
    paint("comment"),
    pushState("shortComment"),
  ),
  on(
    "{",
    literal("{{{{"),
    optional(literal("~")),
    paint("punctuation.special"),
    pushState("rawName"),
  ),
  on(
    "{",
    literal("{{{"),
    optional(literal("~")),
    paint("punctuation.special"),
    pushState("headTriple"),
  ),
  on(
    "{",
    literal("{{"),
    optional(literal("~")),
    choice([literal("#>")], [literal(">")]),
    paint("punctuation.special"),
    pushState("partialHead"),
  ),
  on(
    "{",
    literal("{{"),
    optional(literal("~")),
    optional(byte("#/^&")),
    paint("punctuation.special"),
    pushState("headDouble"),
  ),
];
states.longComment = {
  style: "comment",
  arms: [token("--~}}", "comment", popState()), token("--}}", "comment", popState())],
};
states.shortComment = { style: "comment", arms: [token("}}", "comment", popState())] };
states.rawName = {
  style: "plain",
  arms: [
    on(space, bytes(space), paint("plain")),
    on(
      name,
      bytes(name),
      shell.captureReset(),
      shell.captureAppend(),
      paint("function"),
      setState("rawHeader"),
    ),
  ],
  otherwise: [popState()],
};
states.rawBody = {
  style: "text.literal",
  arms: [
    on(
      "{",
      literal("{{{{"),
      optional(literal("~")),
      bytes(space, { min: 0 }),
      literal("/"),
      shell.captured(),
      bytes(space, { min: 0 }),
      optional(literal("~")),
      literal("}}}}"),
      paint("punctuation.special"),
      popState(),
    ),
  ],
};

const keyword = `else if unless each with as yield let in-element log debugger has-block
  has-block-params`
  .trim()
  .split(/\s+/);
const constants = `true false null undefined`.trim().split(/\s+/);
const keywords = (next?: string) =>
  keyword.map((word) =>
    on(word[0]!, literal(word), notNext(path), paint("keyword"), ...(next ? [setState(next)] : [])),
  );
const literals = (next?: string) =>
  constants.map((word) =>
    on(
      word[0]!,
      literal(word),
      notNext(path),
      paint("constant.builtin"),
      ...(next ? [setState(next)] : []),
    ),
  );
const number = (next?: string) =>
  on(
    "-0123456789",
    optional(literal("-")),
    bytes(digit),
    optional(literal("."), bytes(digit)),
    notNext(path),
    paint("number"),
    ...(next ? [setState(next)] : []),
  );
const hash = on(path, bytes(path), lookahead(literal("=")), paint("property"));
const quoted = [
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
];
states.rawHeader = {
  style: "plain",
  arms: [
    token("~}}}}", "punctuation.special", setState("rawBody")),
    token("}}}}", "punctuation.special", setState("rawBody")),
    on(space, bytes(space), paint("plain")),
    ...quoted,
    token("(", "punctuation.bracket", pushState("subHead")),
    token("=", "operator"),
    ...keywords(),
    ...literals(),
    number(),
    hash,
    on(path, bytes(path), paint("variable")),
  ],
};
states.partialHead = {
  style: "plain",
  arms: [
    token("~}}", "punctuation.special", popState()),
    token("}}", "punctuation.special", popState()),
    on(space, bytes(space), paint("plain")),
    token("(", "punctuation.bracket", setState("exprDouble"), pushState("subHead")),
    token('"', "string", setState("exprDouble"), pushState("doubleString")),
    token("'", "string", setState("exprDouble"), pushState("singleString")),
    on(path, bytes(path), paint("function"), setState("exprDouble")),
  ],
};
for (const [head, body, close] of [
  ["headDouble", "exprDouble", "}}"],
  ["headTriple", "exprTriple", "}}}"],
] as const) {
  const end = [
    token("~" + close, "punctuation.special", popState()),
    token(close, "punctuation.special", popState()),
  ];
  states[head] = {
    style: "plain",
    arms: [
      ...end,
      on(space, bytes(space), paint("plain")),
      ...keywords(body),
      ...literals(body),
      token("(", "punctuation.bracket", setState(body), pushState("subHead")),
      token('"', "string", setState(body), pushState("doubleString")),
      token("'", "string", setState(body), pushState("singleString")),
      number(body),
      on(
        path,
        bytes(path),
        lookahead(bytes(space), byte(except(all, space + "}~"))),
        paint("function"),
        setState(body),
      ),
      on(path, bytes(path), paint("variable"), setState(body)),
    ],
  };
  states[body] = {
    style: "plain",
    arms: [
      ...end,
      on(space, bytes(space), paint("plain")),
      ...quoted,
      token("(", "punctuation.bracket", pushState("subHead")),
      token(")", "punctuation.bracket"),
      token("|", "punctuation.special"),
      token("=", "operator"),
      ...keywords(),
      ...literals(),
      number(),
      hash,
      on(path, bytes(path), paint("variable")),
    ],
  };
}
states.subHead = {
  style: "plain",
  arms: [
    on(space, bytes(space), paint("plain")),
    token(")", "punctuation.bracket", popState()),
    ...keywords("subBody"),
    on(path, bytes(path), paint("function"), setState("subBody")),
  ],
};
states.subBody = {
  style: "plain",
  arms: [
    on(space, bytes(space), paint("plain")),
    token(")", "punctuation.bracket", popState()),
    token("(", "punctuation.bracket", pushState("subHead")),
    ...quoted,
    token("=", "operator"),
    ...keywords(),
    ...literals(),
    number(),
    hash,
    on(path, bytes(path), paint("variable")),
  ],
};
states.doubleString = {
  style: "string",
  arms: [
    on("\\", literal("\\"), byte(all), paint("string.escape")),
    token('"', "string", popState()),
  ],
};
states.singleString = {
  style: "string",
  arms: [
    on("\\", literal("\\"), byte(all), paint("string.escape")),
    token("'", "string", popState()),
  ],
};

const embeddedNames = [
  "longComment",
  "shortComment",
  "rawName",
  "rawHeader",
  "rawBody",
  "partialHead",
  "headDouble",
  "headTriple",
  "exprDouble",
  "exprTriple",
  "subHead",
  "subBody",
  "doubleString",
  "singleString",
];
const embeddedArm = (arm: Arm): Arm => ({
  ...arm,
  then: arm.then.flatMap<Effect>((effect) => {
    if (effect.kind === "paint") return [hostPrefix(), effect];
    if (effect.kind === "push" || effect.kind === "goto")
      return [{ ...effect, state: `${effect.state}Embedded` }];
    return [effect];
  }),
});
for (const name of embeddedNames) {
  const state = states[name]!;
  states[`${name}Embedded`] = {
    ...state,
    arms: [
      ...state.arms.map(embeddedArm),
      ...(state.otherwise ? [] : [on(all, character(), hostPrefix(), paint(state.style))]),
    ],
  };
}
const embeddedMustache = mustache.map(embeddedArm);
const insensitive = (word: string): Matcher[] =>
  [...word].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const boundary = space + "/>";
const typeValue = (value: string) => {
  const mime = value.includes("/");
  return choice(
    [
      literal('"'),
      bytes(space, { min: 0 }),
      ...insensitive(value),
      ...(mime
        ? [optional(bytes(space, { min: 0 }), literal(";"), bytes(except(all, '"'), { min: 0 }))]
        : []),
      bytes(space, { min: 0 }),
      literal('"'),
    ],
    [
      literal("'"),
      bytes(space, { min: 0 }),
      ...insensitive(value),
      ...(mime
        ? [optional(bytes(space, { min: 0 }), literal(";"), bytes(except(all, "'"), { min: 0 }))]
        : []),
      bytes(space, { min: 0 }),
      literal("'"),
    ],
    [
      ...insensitive(value),
      ...(mime ? [optional(literal(";"), bytes(except(all, space + ">"), { min: 0 }))] : []),
      lookahead(byte(space + ">")),
    ],
  );
};
const jsTypes = [
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "application/ecmascript",
  "text/ecmascript",
  "text/jscript",
  "text/livescript",
  "text/x-javascript",
  "application/x-javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
];
for (const [tag, initial, languages] of [
  ["script", "script", ["script", "javascript", "json", "plain"]],
  ["style", "css", ["css"]],
] as const) {
  states[`${tag}Name`] = {
    style: "plain",
    arms: [on(tagName, bytes(tagName), paint("tag"), setState(`${tag}Tag_${initial}`))],
  };
  for (const mode of languages) {
    const language = mode === "script" ? "javascript" : mode;
    const typeArms: Arm[] =
      mode === "script"
        ? [
            ...[
              ...jsTypes.map((value) => [value, "javascript"] as const),
              ...["application/json", "application/ld+json", "importmap", "speculationrules"].map(
                (value) => [value, "json"] as const,
              ),
            ].map(([value, next]) =>
              on(
                "tT",
                ...insensitive("type"),
                lookahead(
                  bytes(space, { min: 0 }),
                  literal("="),
                  bytes(space, { min: 0 }),
                  typeValue(value),
                ),
                paint("attribute"),
                setState(`scriptTag_${next}`),
                pushState("afterAttribute"),
              ),
            ),
            on(
              "tT",
              ...insensitive("type"),
              lookahead(
                bytes(space, { min: 0 }),
                choice(
                  [literal("="), bytes(space, { min: 0 }), lookahead(literal(">"))],
                  [notNext("=")],
                ),
              ),
              notNext(attrName),
              paint("attribute"),
              setState("scriptTag_javascript"),
              pushState("afterAttribute"),
            ),
            on(
              "tT",
              ...insensitive("type"),
              lookahead(byte(space + "=/>")),
              paint("attribute"),
              setState("scriptTag_plain"),
              pushState("afterAttribute"),
            ),
          ]
        : [];
    const finish = () => [
      ...(language === "plain" ? [] : [openInjection({ static: language })]),
      setState(`${tag}Body_${language}`),
    ];
    states[`${tag}Tag_${mode}`] = {
      style: "plain",
      arms: [
        token("/>", "punctuation.bracket", ...finish()),
        token(">", "punctuation.bracket", ...finish()),
        on(space, bytes(space), paint("plain")),
        ...typeArms,
        ...mustache,
        on(attrName, bytes(attrName), paint("attribute"), pushState("afterAttribute")),
      ],
    };
    const prefix = language === "plain" ? mustache : embeddedMustache;
    const close = on(
      "<",
      literal("</"),
      lookahead(...insensitive(tag), byte(boundary)),
      ...(language === "plain" ? [] : [closeInjection()]),
      paint("punctuation.bracket"),
      setState("tagName"),
    );
    states[`${tag}Body_${language}`] = {
      style: "plain",
      arms: [
        close,
        ...(tag === "script"
          ? [token("<!--", "plain", setState(`${tag}Body_${language}_escaped`))]
          : []),
        ...escape("plain"),
        ...prefix,
      ],
    };
    if (tag === "script") {
      states[`${tag}Body_${language}_escaped`] = {
        style: "plain",
        arms: [
          close,
          token("-->", "plain", setState(`${tag}Body_${language}`)),
          on(
            "<",
            literal("<"),
            ...insensitive("script"),
            lookahead(byte(boundary)),
            paint("plain"),
            setState(`${tag}Body_${language}_double`),
          ),
          ...escape("plain"),
          ...prefix,
        ],
      };
      states[`${tag}Body_${language}_double`] = {
        style: "plain",
        arms: [
          token("-->", "plain", setState(`${tag}Body_${language}`)),
          on(
            "<",
            literal("</"),
            ...insensitive("script"),
            lookahead(byte(boundary)),
            paint("plain"),
            setState(`${tag}Body_${language}_escaped`),
          ),
          ...escape("plain"),
          ...prefix,
        ],
      };
    }
  }
}

states.root = {
  style: "plain",
  arms: [
    ...escape("plain"),
    ...mustache,
    token("<!--", "comment", pushState("htmlComment")),
    token("<!", "keyword", pushState("declaration")),
    ...["script", "style"].map((tag) =>
      on(
        "<",
        literal("<"),
        lookahead(...insensitive(tag), byte(boundary)),
        paint("punctuation.bracket"),
        pushState(`${tag}Name`),
      ),
    ),
    on(
      "<",
      literal("</"),
      lookahead(byte(tagName)),
      paint("punctuation.bracket"),
      pushState("tagName"),
    ),
    on(
      "<",
      literal("<"),
      lookahead(byte(tagName)),
      paint("punctuation.bracket"),
      pushState("tagName"),
    ),
    reference,
  ],
};
states.htmlComment = {
  style: "comment",
  arms: [token("-->", "comment", popState()), ...escape("comment"), ...mustache],
};
states.declaration = { style: "keyword", arms: [token(">", "keyword", popState()), ...mustache] };
states.tagName = {
  style: "plain",
  arms: [
    on(upper, byte(upper), bytes(tagName, { min: 0 }), paint("type"), setState("tag")),
    on(tagName, bytes(tagName), paint("tag"), setState("tag")),
  ],
};
states.tag = {
  style: "plain",
  arms: [
    token("/>", "punctuation.bracket", popState()),
    token(">", "punctuation.bracket", popState()),
    on(space, bytes(space), paint("plain")),
    ...mustache,
    on(attrName, bytes(attrName), paint("attribute"), pushState("afterAttribute")),
  ],
};
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
    redispatch(">", popState()),
  ],
  otherwise: [setState("attributeUnquoted")],
};
states.attributeDouble = {
  style: "string",
  arms: [token('"', "string", popState()), ...escape("string"), ...mustache, reference],
};
states.attributeSingle = {
  style: "string",
  arms: [token("'", "string", popState()), ...escape("string"), ...mustache, reference],
};
states.attributeUnquoted = {
  style: "string",
  arms: [
    token("/>", "punctuation.bracket", popState(), popState()),
    redispatch(space + ">", popState()),
    ...escape("string"),
    ...mustache,
    reference,
  ],
};
export default defineGrammar({
  name: "handlebars",
  extensions: ["hbs", "handlebars"],
  aliases: ["hbs"],
  initial: "root",
  states,
});
