import {
  byte,
  bytes,
  byteSet,
  closeInjection,
  defineGrammar,
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
  repeat,
  setState,
  token,
  union,
  type Arm,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const alpha = union(range("a", "z"), range("A", "Z"), "_");
const digit = range("0", "9");
const word = union(alpha, digit, "-");
const ident = union(word, ".");
const states: Record<string, State> = {};
const directive = token(
  "%%{",
  "punctuation.special",
  openInjection({ static: "fjson" }),
  pushState("directive"),
);
const comment = token("%%", "comment", pushState("comment"));
const quoted = [
  token('"`', "string", pushState("markdownString")),
  token('"', "string", pushState("string")),
];
const common: Arm[] = [
  directive,
  comment,
  ...quoted,
  token(":::", "punctuation.special", pushState("className")),
  on(
    "-0123456789",
    optional(literal("-")),
    bytes(digit),
    optional(literal("."), bytes(digit)),
    notNext(ident),
    paint("number"),
  ),
];
states.comment = { style: "comment", arms: [on("\r\n", byte("\r\n"), paint("plain"), popState())] };
states.directive = {
  style: "plain",
  arms: [
    on("}", literal("}%%"), closeInjection(), paint("punctuation.special"), popState()),
    token('"', "plain", pushState("directiveDouble")),
    token("'", "plain", pushState("directiveSingle")),
  ],
};
for (const [state, end] of [
  ["directiveDouble", '"'],
  ["directiveSingle", "'"],
] as const) {
  states[state] = {
    style: "plain",
    arms: [on("\\", literal("\\"), byte(all), paint("plain")), token(end, "plain", popState())],
  };
}
states.string = {
  style: "string",
  arms: [
    on("\\", literal("\\"), byte(all), paint("string.escape")),
    token('"', "string", popState()),
  ],
};
states.markdownString = {
  style: "string",
  arms: [
    on("\\", literal("\\"), byte(all), paint("string.escape")),
    token('`"', "string", popState()),
  ],
};
states.className = {
  style: "plain",
  arms: [on(alpha, byte(alpha), bytes(word, { min: 0 }), paint("type"), popState())],
  otherwise: [popState()],
};
const types: readonly (readonly [string, string])[] = [
  ["flowchart", "flow"],
  ["graph", "flow"],
  ["sequenceDiagram", "sequence"],
  ["classDiagram-v2", "class"],
  ["classDiagram", "class"],
  ["stateDiagram-v2", "class"],
  ["stateDiagram", "class"],
  ["erDiagram", "er"],
  ["gantt", "generic"],
  ["pie", "generic"],
  ["journey", "generic"],
  ["gitGraph", "generic"],
  ["mindmap", "generic"],
  ["timeline", "generic"],
  ["quadrantChart", "generic"],
  ["xychart-beta", "generic"],
  ["sankey-beta", "generic"],
  ["block-beta", "generic"],
  ["C4Context", "generic"],
  ["C4Container", "generic"],
  ["C4Component", "generic"],
  ["C4Dynamic", "generic"],
  ["C4Deployment", "generic"],
  ["requirementDiagram", "generic"],
  ["packet-beta", "generic"],
  ["architecture-beta", "generic"],
  ["kanban", "generic"],
  ["radar-beta", "generic"],
  ["treemap-beta", "generic"],
];
const keywords: Record<string, string[]> = {
  flow: [
    "subgraph",
    "end",
    "classDef",
    "class",
    "style",
    "linkStyle",
    "click",
    "direction",
    "default",
    "TD",
    "TB",
    "BT",
    "RL",
    "LR",
  ],
  sequence: [
    "participant",
    "actor",
    "as",
    "activate",
    "deactivate",
    "loop",
    "alt",
    "else",
    "opt",
    "par",
    "and",
    "critical",
    "option",
    "break",
    "rect",
    "end",
    "Note",
    "over",
    "right",
    "left",
    "of",
    "autonumber",
    "box",
    "create",
    "destroy",
  ],
  class: [
    "class",
    "namespace",
    "end",
    "direction",
    "note",
    "for",
    "state",
    "as",
    "link",
    "click",
    "callback",
  ],
  er: ["direction", "title"],
  generic: [
    "title",
    "section",
    "dateFormat",
    "axisFormat",
    "excludes",
    "includes",
    "todayMarker",
    "tickInterval",
    "accTitle",
    "accDescr",
    "direction",
    "end",
    "showData",
    "x-axis",
    "y-axis",
  ],
};
const arrows = [
  "<<-->>",
  ...["||", "|o", "}|", "}o"].flatMap((left) =>
    ["--", ".."].flatMap((line) => ["||", "o|", "|{", "o{"].map((right) => left + line + right)),
  ),
  "<-->",
  "-->>",
  "->>",
  "-.->",
  "==>",
  "<|--",
  "--|>",
  "<|..",
  "..|>",
  "-->",
  "---",
  "--o",
  "--x",
  "*--",
  "o--",
  "..>",
  "->",
  "-x",
  "-)",
  "--)",
  "--",
  "==",
  "..",
];
const edgeArms = [...new Set(arrows)]
  .sort((a, b) => b.length - a.length)
  .map((text) => token(text, "operator"));
const nameByte = union(alpha, digit, "_.");
const names = on(
  alpha,
  byte(alpha),
  bytes(nameByte, { min: 0 }),
  repeat(literal("-"), notNext("-x).>"), bytes(nameByte)),
  paint("variable"),
);
const directions = types.map(([text, state]) =>
  on(text[0]!, literal(text), notNext(word), paint("keyword"), setState(state)),
);
states.frontmatter = {
  style: "plain",
  arms: [
    on(
      "-",
      lineStart(),
      literal("---"),
      optional(literal("\r")),
      lineEnd(),
      closeInjection(),
      paint("punctuation.special"),
      popState(),
    ),
  ],
};
states.root = {
  style: "plain",
  arms: [
    on(
      "-",
      lineStart(),
      literal("---"),
      optional(literal("\r")),
      lineEnd(),
      paint("punctuation.special"),
      openInjection({ static: "yaml" }),
      pushState("frontmatter"),
    ),
    ...common,
    ...directions,
    on(
      alpha,
      byte(alpha),
      bytes(union(alpha, digit, "_.-"), { min: 0 }),
      paint("variable"),
      setState("generic"),
    ),
  ],
};
for (const [mode, words] of Object.entries(keywords)) {
  const selected = words.map((text) =>
    on(text[0]!, literal(text), notNext(word), paint("keyword")),
  );
  states[mode] = {
    style: "plain",
    arms: [
      ...common,
      ...selected,
      ...(mode === "flow"
        ? [
            on(
              "-",
              literal("--"),
              lookahead(bytes(" \t")),
              paint("operator"),
              pushState("arrowText"),
            ),
          ]
        : []),
      ...edgeArms,
      ...(mode === "flow"
        ? [
            token("[", "punctuation.bracket", pushState("squareLabel")),
            token("(", "punctuation.bracket", pushState("roundLabel")),
            token("{", "punctuation.bracket", pushState("braceLabel")),
            token("|", "punctuation.special", pushState("edgeLabel")),
            token(">", "punctuation.bracket", pushState("squareLabel")),
          ]
        : []),
      ...(mode === "sequence" ? [token(":", "punctuation.delimiter", pushState("lineLabel"))] : []),
      ...["[", "]", "(", ")", "{", "}"].map((text) => token(text, "punctuation.bracket")),
      ...[":", ",", ";"].map((text) => token(text, "punctuation.delimiter")),
      ...["+", "-", "#", "~", "=", "*", "|"].map((text) => token(text, "operator")),
      names,
    ],
  };
}
for (const [name, end] of [
  ["squareLabel", "]"],
  ["roundLabel", ")"],
  ["braceLabel", "}"],
] as const) {
  states[name] = {
    style: "string",
    arms: [
      token(end, "punctuation.bracket", popState()),
      ...quoted,
      token("[", "punctuation.bracket", pushState("squareLabel")),
      token("(", "punctuation.bracket", pushState("roundLabel")),
      token("{", "punctuation.bracket", pushState("braceLabel")),
    ],
  };
}
states.arrowText = {
  style: "string",
  arms: [
    ...["-->", "---", "--o", "--x", "==>"].map((text) => token(text, "operator", popState())),
    on("\r\n", byte("\r\n"), paint("plain"), popState()),
    ...quoted,
  ],
};
states.edgeLabel = {
  style: "string",
  arms: [token("|", "punctuation.special", popState()), ...quoted],
};
states.lineLabel = {
  style: "string",
  arms: [on("\r\n", byte("\r\n"), paint("plain"), popState()), ...quoted],
};
export default defineGrammar({ name: "mermaid", initial: "root", states });
