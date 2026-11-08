import {
  byte,
  bytes,
  byteSet,
  choice,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
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
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const name = except(all, space + "/>='\"<");
const attribute = except(all, space + "/>='\"<");
const part = except(all, space + "/>='\"<.:[]");
const boundary = space + "/>";
const insensitive = (word: string): Matcher[] =>
  [...word].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const reference = (prefix: Effect[] = []) =>
  on(
    "&",
    literal("&"),
    choice(
      [literal("#"), byte("xX"), bytes(hex), optional(literal(";"))],
      [literal("#"), bytes(digit), optional(literal(";"))],
      [byte(alpha), bytes(union(alpha, digit), { min: 0 }), optional(literal(";"))],
    ),
    ...prefix,
    paint("string.escape"),
  );
const names = (text: string) => lookahead(...insensitive(text), byte(boundary));
const valueIs = (value: string) =>
  choice(
    [literal('"'), literal(value), literal('"')],
    [literal("'"), literal(value), literal("'")],
    [literal(value), lookahead(byte(boundary))],
  );
const states: Record<string, State> = {};
const comments = token("<!--", "comment", pushState("comment"));
states.comment = { style: "comment", arms: [token("-->", "comment", popState())] };
states.declaration = { style: "keyword", arms: [token(">", "keyword", popState())] };

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
states.attributeDouble = { style: "string", arms: [reference(), token('"', "string", popState())] };
states.attributeSingle = { style: "string", arms: [reference(), token("'", "string", popState())] };
states.attributeUnquoted = {
  style: "string",
  arms: [reference(), redispatch(space + ">", popState())],
};

for (const lang of ["javascript", "typescript"] as const) {
  const dir = `directive_${lang}`;
  states[`${dir}_tail`] = {
    style: "plain",
    arms: [
      token(":", "punctuation.special", setState(`${dir}_argument`)),
      token(".", "punctuation.special", setState(`${dir}_modifier`)),
    ],
    otherwise: [setState(`${dir}_after`)],
  };
  states[`${dir}_argument`] = {
    style: "plain",
    arms: [
      token("[", "punctuation.bracket", setState(`${dir}_dynamic`)),
      on(part, bytes(part), paint("property"), setState(`${dir}_tail`)),
    ],
    otherwise: [setState(`${dir}_tail`)],
  };
  states[`${dir}_dynamic`] = {
    style: "property",
    arms: [token("]", "punctuation.bracket", setState(`${dir}_tail`))],
  };
  states[`${dir}_modifier`] = {
    style: "plain",
    arms: [on(part, bytes(part), paint("label"), setState(`${dir}_tail`))],
    otherwise: [setState(`${dir}_tail`)],
  };
  states[`${dir}_after`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), lookahead(literal("=")), paint("plain")),
      token("=", "operator", setState(`${dir}_value`)),
    ],
    otherwise: [popState()],
  };
  states[`${dir}_value`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), paint("plain")),
      token('"', "punctuation.special", openInjection({ static: lang }), setState(`${dir}_double`)),
      token("'", "punctuation.special", openInjection({ static: lang }), setState(`${dir}_single`)),
      redispatch(">", popState()),
    ],
    otherwise: [openInjection({ static: lang }), setState(`${dir}_unquoted`)],
  };
  states[`${dir}_double`] = {
    style: "plain",
    arms: [
      reference([hostPrefix()]),
      on('"', literal('"'), closeInjection(), paint("punctuation.special"), popState()),
    ],
  };
  states[`${dir}_single`] = {
    style: "plain",
    arms: [
      reference([hostPrefix()]),
      on("'", literal("'"), closeInjection(), paint("punctuation.special"), popState()),
    ],
  };
  states[`${dir}_unquoted`] = {
    style: "plain",
    arms: [reference([hostPrefix()]), redispatch(space + ">", closeInjection(), popState())],
  };
  states[`interpolation_${lang}`] = {
    style: "plain",
    arms: [on("}", literal("}}"), closeInjection(), paint("punctuation.special"), popState())],
  };
}
const directiveArms = (lang: "javascript" | "typescript"): Arm[] => [
  on("v", literal("v-"), bytes(part), paint("attribute"), pushState(`directive_${lang}_tail`)),
  on(":@#", byte(":@#"), paint("punctuation.special"), pushState(`directive_${lang}_argument`)),
];
const normalAttribute = on(
  attribute,
  bytes(attribute),
  paint("attribute"),
  pushState("afterAttribute"),
);
const tagArms = (lang: "javascript" | "typescript"): Arm[] => [
  on(space, bytes(space), paint("plain")),
  ...directiveArms(lang),
  normalAttribute,
];
for (const mode of ["javascript", "typescript"] as const) {
  const root = `root_${mode}`;
  const template = `template_${mode}`;
  const nested = `nestedTemplate_${mode}`;
  states[root] = {
    style: "plain",
    arms: [
      comments,
      on(
        "<",
        literal("<"),
        names("template"),
        paint("punctuation.bracket"),
        setState(`topTemplateName_${mode}`),
      ),
      on(
        "<",
        literal("<"),
        names("script"),
        paint("punctuation.bracket"),
        setState(`scriptName_${mode}`),
      ),
      on(
        "<",
        literal("<"),
        names("style"),
        paint("punctuation.bracket"),
        setState(`styleName_${mode}`),
      ),
      on(
        "<",
        literal("<"),
        lookahead(byte(name)),
        shell.captureReset(),
        paint("punctuation.bracket"),
        setState(`customName_${mode}`),
      ),
    ],
  };
  states[`topTemplateName_${mode}`] = {
    style: "plain",
    arms: [on(name, bytes(name), paint("tag"), setState(`topTemplateTag_${mode}`))],
  };
  states[`topTemplateTag_${mode}`] = {
    style: "plain",
    arms: [
      token("/>", "punctuation.bracket", setState(root)),
      token(">", "punctuation.bracket", setState(template)),
      ...tagArms(mode),
    ],
  };
  const body = (level: "top" | "nested"): State => ({
    style: "plain",
    arms: [
      comments,
      token("<!", "keyword", pushState("declaration")),
      token(
        "{{",
        "punctuation.special",
        openInjection({ static: mode }),
        pushState(`interpolation_${mode}`),
      ),
      on(
        "<",
        literal("</"),
        names("template"),
        paint("punctuation.bracket"),
        setState(`${level}TemplateCloseName_${mode}`),
      ),
      on(
        "<",
        literal("<"),
        names("template"),
        paint("punctuation.bracket"),
        pushState(`nestedTemplateName_${mode}`),
      ),
      on(
        "<",
        literal("</"),
        lookahead(byte(name)),
        paint("punctuation.bracket"),
        pushState(`htmlName_${mode}`),
      ),
      on(
        "<",
        literal("<"),
        lookahead(byte(name)),
        paint("punctuation.bracket"),
        pushState(`htmlName_${mode}`),
      ),
      reference(),
    ],
  });
  states[template] = body("top");
  states[nested] = body("nested");
  states[`nestedTemplateName_${mode}`] = {
    style: "plain",
    arms: [on(name, bytes(name), paint("tag"), setState(`nestedTemplateTag_${mode}`))],
  };
  states[`nestedTemplateTag_${mode}`] = {
    style: "plain",
    arms: [
      token("/>", "punctuation.bracket", popState()),
      token(">", "punctuation.bracket", setState(nested)),
      ...tagArms(mode),
    ],
  };
  for (const kind of ["top", "nested"] as const) {
    states[`${kind}TemplateCloseName_${mode}`] = {
      style: "plain",
      arms: [on(name, bytes(name), paint("tag"), setState(`${kind}TemplateCloseEnd_${mode}`))],
    };
    states[`${kind}TemplateCloseEnd_${mode}`] = {
      style: "plain",
      arms: [
        on(space, bytes(space), paint("plain")),
        token(">", "punctuation.bracket", ...(kind === "top" ? [setState(root)] : [popState()])),
      ],
    };
  }
  states[`htmlName_${mode}`] = {
    style: "plain",
    arms: [on(name, bytes(name), paint("tag"), setState(`htmlTag_${mode}`))],
  };
  states[`htmlTag_${mode}`] = {
    style: "plain",
    arms: [
      token("/>", "punctuation.bracket", popState()),
      token(">", "punctuation.bracket", popState()),
      ...tagArms(mode),
    ],
  };

  const definitions = [
    {
      tag: "script",
      kinds: ["javascript", "typescript", "tsx", "jsx", "plain"],
      values: [
        ["js", "javascript"],
        ["javascript", "javascript"],
        ["ts", "typescript"],
        ["typescript", "typescript"],
        ["tsx", "tsx"],
        ["jsx", "jsx"],
      ],
      initial: "javascript",
    },
    {
      tag: "style",
      kinds: ["css", "scss", "plain"],
      values: [
        ["css", "css"],
        ["scss", "scss"],
      ],
      initial: "css",
    },
    { tag: "custom", kinds: ["plain", "json"], values: [["json", "json"]], initial: "plain" },
  ] as const;
  for (const definition of definitions) {
    const tag = definition.tag;
    states[`${tag}Name_${mode}`] = {
      style: "plain",
      arms: [
        on(
          name,
          bytes(name),
          ...(tag === "custom" ? [shell.captureAppend()] : []),
          paint("tag"),
          setState(`${tag}Tag_${mode}_${definition.initial}`),
        ),
      ],
    };
    for (const language of definition.kinds) {
      const state = `${tag}Tag_${mode}_${language}`;
      const nextMode =
        mode === "typescript" ||
        (tag === "script" && (language === "typescript" || language === "tsx"))
          ? "typescript"
          : "javascript";
      const nextRoot = `root_${nextMode}`;
      const langArms: Arm[] = definition.values.map(([value, selected]) =>
        on(
          "lL",
          ...insensitive("lang"),
          notNext(attribute),
          lookahead(
            bytes(space, { min: 0 }),
            literal("="),
            bytes(space, { min: 0 }),
            valueIs(value),
          ),
          paint("attribute"),
          setState(`${tag}Tag_${mode}_${selected}`),
          pushState("afterAttribute"),
        ),
      );
      langArms.push(
        on(
          "lL",
          ...insensitive("lang"),
          notNext(attribute),
          lookahead(bytes(space, { min: 0 }), literal("=")),
          paint("attribute"),
          setState(`${tag}Tag_${mode}_plain`),
          pushState("afterAttribute"),
        ),
      );
      states[state] = {
        style: "plain",
        arms: [
          token("/>", "punctuation.bracket", setState(nextRoot)),
          token(
            ">",
            "punctuation.bracket",
            ...(language === "plain" ? [] : [openInjection({ static: language })]),
            setState(`${tag}Body_${mode}_${language}`),
          ),
          on(space, bytes(space), paint("plain")),
          ...langArms,
          normalAttribute,
        ],
      };
      const closing = tag === "custom" ? [shell.captured()] : insensitive(tag);
      states[`${tag}Body_${mode}_${language}`] = {
        style: "plain",
        arms: [
          on(
            "<",
            literal("</"),
            lookahead(...closing, byte(boundary)),
            ...(language === "plain" ? [] : [closeInjection()]),
            paint("punctuation.bracket"),
            setState(`topCloseName_${nextMode}`),
          ),
        ],
      };
    }
  }
  states[`topCloseName_${mode}`] = {
    style: "plain",
    arms: [on(name, bytes(name), paint("tag"), setState(`topCloseEnd_${mode}`))],
  };
  states[`topCloseEnd_${mode}`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), paint("plain")),
      token(">", "punctuation.bracket", setState(root)),
    ],
  };
}

export default defineGrammar({ name: "vue", initial: "root_javascript", states });
