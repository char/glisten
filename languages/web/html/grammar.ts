import {
  byte,
  bytes,
  byteSet,
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
  type Effect,
  type Matcher,
} from "#/grammar/mod.ts";

const space = " \t\n\r\f";
const alpha = union(range("a", "z"), range("A", "Z"));
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const all = byteSet({ ranges: [[0, 255]] });
const nameByte = except(all, space + "/>");
const attrByte = except(all, space + "/>='\"");
const boundary = space + "/>";
const insensitive = (word: string): Matcher[] =>
  [...word].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const reference = (attribute = false, prefix: Effect[] = []) =>
  on(
    "&",
    literal("&"),
    choice(
      [literal("#"), byte("xX"), bytes(hex), optional(literal(";"))],
      [literal("#"), bytes(digit), optional(literal(";"))],
      [
        byte(alpha),
        bytes(union(alpha, digit), { min: 0 }),
        ...(attribute
          ? [choice([literal(";")], [notNext(union(alpha, digit, "="))])]
          : [optional(literal(";"))]),
      ],
    ),
    ...prefix,
    paint("string.escape"),
  );
const rawNames = [
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
] as const;
const rawStarts = rawNames.map((name) =>
  on(
    "<",
    literal("<"),
    lookahead(...insensitive(name), byte(boundary)),
    paint("punctuation.bracket"),
    setState(`name-${name}`),
  ),
);
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
  ...`
    module text/javascript application/javascript application/ecmascript text/ecmascript
    text/jscript text/livescript text/x-javascript application/x-javascript text/javascript1.0
    text/javascript1.1 text/javascript1.2 text/javascript1.3 text/javascript1.4 text/javascript1.5
  `
    .trim()
    .split(/\s+/),
];
const jsonTypes = `
  application/json application/ld+json importmap speculationrules
`
  .trim()
  .split(/\s+/);
const events = `
  onabort onafterprint onauxclick onbeforeinput onbeforematch onbeforeprint onbeforetoggle
  onbeforeunload onblur oncancel oncanplay oncanplaythrough onchange onclick onclose oncontextlost
  oncontextmenu oncontextrestored oncopy oncuechange oncut ondblclick ondrag ondragend ondragenter
  ondragleave ondragover ondragstart ondrop ondurationchange onemptied onended onerror onfocus
  onformdata onhashchange oninput oninvalid onkeydown onkeypress onkeyup onlanguagechange onload
  onloadeddata onloadedmetadata onloadstart onmessage onmessageerror onmousedown onmouseenter
  onmouseleave onmousemove onmouseout onmouseover onmouseup onoffline ononline onpagehide
  onpagereveal onpageshow onpageswap onpaste onpause onplay onplaying onpopstate onprogress
  onratechange onrejectionhandled onreset onresize onscroll onscrollend onsecuritypolicyviolation
  onseeked onseeking onselect onslotchange onstalled onstorage onsubmit onsuspend ontimeupdate
  ontoggle onunhandledrejection onunload onvolumechange onwaiting onwebkitanimationend
  onwebkitanimationiteration onwebkitanimationstart onwebkittransitionend onwheel onpointerover
  onpointerenter onpointerdown onpointermove onpointerrawupdate onpointerup onpointercancel
  onpointerout onpointerleave ongotpointercapture onlostpointercapture ontouchstart ontouchend
  ontouchmove ontouchcancel
`
  .trim()
  .split(/\s+/);
const tagStates = [
  "normal",
  "script",
  "script-js",
  "script-json",
  "script-plain",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
] as const;
const states: Record<
  string,
  {
    style: "plain" | "string" | "comment" | "keyword";
    arms: Arm[];
    otherwise?: Effect[];
  }
> = {
  root: {
    style: "plain",
    arms: [
      token("<!-->", "comment"),
      token("<!--->", "comment"),
      token("<!--", "comment", setState("comment")),
      on("<", literal("<!"), ...insensitive("doctype"), paint("keyword"), setState("doctype")),
      token("<!", "comment", setState("bogus-comment")),
      token("<?", "comment", setState("bogus-comment")),
      ...rawStarts,
      on(
        "<",
        literal("</"),
        lookahead(byte(alpha)),
        paint("punctuation.bracket"),
        setState("end-name"),
      ),
      on(
        "<",
        literal("<"),
        lookahead(byte(alpha)),
        paint("punctuation.bracket"),
        setState("name-normal"),
      ),
      reference(),
    ],
  },
  comment: {
    style: "comment",
    arms: [token("--!>", "comment", setState("root")), token("-->", "comment", setState("root"))],
  },
  "bogus-comment": { style: "comment", arms: [token(">", "comment", setState("root"))] },
  doctype: { style: "keyword", arms: [token(">", "keyword", setState("root"))] },
  "end-name": {
    style: "plain",
    arms: [on(nameByte, bytes(nameByte), paint("tag"), setState("tag-normal"))],
  },
};
for (const name of ["normal", ...rawNames]) {
  states[`name-${name}`] = {
    style: "plain",
    arms: [on(nameByte, bytes(nameByte), paint("tag"), setState(`tag-${name}`))],
  };
}
for (const mode of tagStates) {
  const body =
    mode === "script" || mode === "script-js"
      ? "raw-script-js"
      : mode === "script-json"
        ? "raw-script-json"
        : mode === "script-plain"
          ? "raw-script-plain"
          : mode === "style"
            ? "raw-style"
            : (
                  [
                    "textarea",
                    "title",
                    "xmp",
                    "iframe",
                    "noembed",
                    "noframes",
                    "plaintext",
                  ] as readonly string[]
                ).includes(mode)
              ? `raw-${mode}`
              : "root";
  const injection =
    body === "raw-script-js"
      ? "javascript"
      : body === "raw-script-json"
        ? "json"
        : body === "raw-style"
          ? "css"
          : "";
  const finish = () => [
    ...(injection ? [openInjection({ static: injection })] : []),
    setState(injection ? `${body}-content` : body),
  ];
  const typeArms: Arm[] =
    mode === "script"
      ? [
          ...[
            ...[...jsTypes].map((value) => [value, "script-js"] as const),
            ...jsonTypes.map((value) => [value, "script-json"] as const),
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
              setState(`tag-${next}`),
              pushState("after-normal"),
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
            notNext(attrByte),
            paint("attribute"),
            setState("tag-script-js"),
            pushState("after-normal"),
          ),
          on(
            "tT",
            ...insensitive("type"),
            lookahead(byte(space + "=/>")),
            paint("attribute"),
            setState("tag-script-plain"),
            pushState("after-normal"),
          ),
        ]
      : [];
  states[`tag-${mode}`] = {
    style: "plain",
    arms: [
      token("/>", "punctuation.bracket", ...finish()),
      token(">", "punctuation.bracket", ...finish()),
      ...typeArms,
      redispatch(attrByte, pushState("attribute")),
    ],
  };
}
states.attribute = {
  style: "plain",
  arms: [
    on("sS", ...insensitive("style"), notNext(attrByte), paint("attribute"), setState("after-css")),
    on(
      "oO",
      byte("oO"),
      bytes(attrByte, { min: 0 }),
      classify(
        keywordTable(events, "attribute", () => [setState("after-javascript")]),
        [paint("attribute"), setState("after-normal")],
        { caseless: true },
      ),
    ),
    on(attrByte, bytes(attrByte), paint("attribute"), setState("after-normal")),
  ],
};
for (const embed of ["", "css", "javascript"]) {
  const label = embed || "normal";
  states[`after-${label}`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), paint("plain")),
      token(
        "=",
        "operator",
        ...(embed ? [openInjection({ static: embed })] : []),
        setState(`value-${label}`),
      ),
    ],
    otherwise: [popState()],
  };
  states[`value-${label}`] = {
    style: "plain",
    arms: [
      on(space, bytes(space), ...(embed ? [hostPrefix()] : []), paint("plain")),
      on(
        '"',
        literal('"'),
        ...(embed ? [hostPrefix()] : []),
        paint("string"),
        setState(`double-${label}`),
      ),
      on(
        "'",
        literal("'"),
        ...(embed ? [hostPrefix()] : []),
        paint("string"),
        setState(`single-${label}`),
      ),
      redispatch(">", ...(embed ? [closeInjection()] : []), popState()),
    ],
    otherwise: [setState(`unquoted-${label}`)],
  };
  for (const [kind, end] of [
    ["double", '"'],
    ["single", "'"],
    ["unquoted", ""],
  ] as const) {
    const stop = kind === "unquoted" ? space + ">" : end;
    states[`${kind}-${label}`] = {
      style: "string",
      arms: [
        ...(kind === "unquoted"
          ? [redispatch(stop, ...(embed ? [closeInjection()] : []), popState())]
          : [
              on(
                end,
                literal(end),
                ...(embed ? [closeInjection()] : []),
                paint("string"),
                popState(),
              ),
            ]),
        reference(true, embed ? [hostPrefix()] : []),
      ],
    };
  }
}
for (const [state, name, injection] of [
  ["raw-script-js", "script", "javascript"],
  ["raw-script-json", "script", "json"],
  ["raw-script-plain", "script", ""],
  ["raw-style", "style", "css"],
  ["raw-textarea", "textarea", ""],
  ["raw-title", "title", ""],
  ["raw-xmp", "xmp", ""],
  ["raw-iframe", "iframe", ""],
  ["raw-noembed", "noembed", ""],
  ["raw-noframes", "noframes", ""],
] as const) {
  const raw = injection ? `${state}-content` : state;
  const close = on(
    "<",
    literal("</"),
    lookahead(...insensitive(name), byte(boundary)),
    ...(injection ? [closeInjection()] : []),
    paint("punctuation.bracket"),
    setState("end-name"),
  );
  states[raw] = {
    style: "plain",
    arms: [
      close,
      ...(name === "script" ? [token("<!--", "plain", setState(`${raw}-escaped`))] : []),
      ...(name === "title" || name === "textarea" ? [reference()] : []),
    ],
  };
  if (name === "script") {
    states[`${raw}-escaped`] = {
      style: "plain",
      arms: [
        close,
        token("-->", "plain", setState(raw)),
        on(
          "<",
          literal("<"),
          ...insensitive("script"),
          lookahead(byte(boundary)),
          paint("plain"),
          setState(`${raw}-double`),
        ),
      ],
    };
    states[`${raw}-double`] = {
      style: "plain",
      arms: [
        token("-->", "plain", setState(raw)),
        on(
          "<",
          literal("</"),
          ...insensitive("script"),
          lookahead(byte(boundary)),
          paint("plain"),
          setState(`${raw}-escaped`),
        ),
      ],
    };
  }
}
states["raw-plaintext"] = { style: "plain", arms: [] };
export default defineGrammar<string>({
  name: "html",
  extensions: ["html", "htm", "xhtml"],
  aliases: ["htm", "xhtml"],
  initial: "root",
  states,
});
