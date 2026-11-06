import {
  byte,
  bytes,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  markRecord,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  patchRecord,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
  utf8Bytes,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const name = [byte(start), bytes(rest, { min: 0 })];
const space = on(
  union(" \t\r\n,", utf8Bytes("\ufeff")),
  choice([bytes(" \t\r\n,")], [literal("\ufeff")]),
  paint("plain"),
);
const comment = token("#", "comment", pushState("comment"));
const escape = on(
  "\\",
  literal("\\"),
  choice(
    [byte('"\\/bfnrt')],
    [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
    [literal("u"), byte(hex), byte(hex), byte(hex), byte(hex)],
  ),
  paint("string.escape"),
);
const string = [
  token('"""', "string", pushState("blockString")),
  token('"', "string", pushState("string")),
];
const number = on(
  "-0123456789",
  optional(literal("-")),
  choice([literal("0")], [byte(range("1", "9")), bytes(digit, { min: 0 })]),
  optional(literal("."), bytes(digit)),
  optional(byte("eE"), optional(byte("+-")), bytes(digit)),
  notNext(union(rest, ".")),
  paint("number"),
);
const directive = token("@", "punctuation.special", pushState("directiveName"));
const variable = token("$", "variable", pushState("variableName"));
const valueName = on(start, ...name, paint("constant.builtin"));
const literals = [comment, ...string, variable, number];
const rootCases = [
  ...["query", "mutation", "subscription"].map((text) => ({
    text,
    then: [paint("keyword"), setState("operation")],
  })),
  { text: "fragment", then: [paint("keyword"), setState("fragmentHead")] },
  ...["schema", "type", "interface", "enum", "input", "extend"].map((text) => ({
    text,
    then: [paint("keyword"), setState("definitionHead")],
  })),
  { text: "directive", then: [paint("keyword"), setState("directiveDefinition")] },
  ...["scalar", "union", "on"].map((text) => ({
    text,
    then: [paint("keyword"), setState("root")],
  })),
  ...keywordTable(["implements", "repeatable"], "keyword"),
];
const rootName = on(start, ...name, classify(rootCases, [paint("type")]));
const argumentNames = on(
  start,
  ...name,
  paint("constant.builtin"),
  markRecord(),
  pushState("argumentProbe"),
);
const argumentsContent = [
  ...literals,
  directive,
  token("[", "punctuation.bracket", pushState("list")),
  token("{", "punctuation.bracket", pushState("object")),
  token(":", "punctuation.delimiter"),
  argumentNames,
];
const definitionsContent = [
  comment,
  ...string,
  directive,
  variable,
  token("(", "punctuation.bracket", pushState("definitionArguments")),
  token(":", "punctuation.delimiter", pushState("typeRef")),
  token("=", "operator", pushState("defaultValue")),
  token(oneOf("![]"), "punctuation.bracket"),
  on(start, ...name, paint("property")),
];

export default defineGrammar({
  name: "graphql",
  aliases: ["gql"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        comment,
        ...string,
        directive,
        rootName,
        token("{", "punctuation.bracket", pushState("selection")),
        token(oneOf("|&="), "operator"),
      ],
    },
    definitionHead: {
      style: "plain",
      arms: [
        comment,
        ...string,
        directive,
        rootName,
        token("(", "punctuation.bracket", pushState("definitionArguments")),
        token("{", "punctuation.bracket", pushState("definitionFields")),
        token(oneOf("|&="), "operator"),
      ],
    },
    directiveDefinition: {
      style: "plain",
      arms: [
        comment,
        token("@", "punctuation.special", pushState("directiveDeclarationName")),
        token("(", "punctuation.bracket", pushState("definitionArguments")),
        rootName,
        token("|", "operator"),
      ],
    },
    directiveDeclarationName: {
      style: "plain",
      arms: [space, comment, on(start, ...name, paint("attribute"), popState())],
      otherwise: [popState()],
    },
    operation: {
      style: "plain",
      arms: [
        comment,
        directive,
        token("(", "punctuation.bracket", pushState("variableDefinitions")),
        token("{", "punctuation.bracket", setState("root"), pushState("selection")),
        on(start, ...name, paint("label")),
      ],
    },
    fragmentHead: {
      style: "plain",
      arms: [
        comment,
        directive,
        token("{", "punctuation.bracket", setState("root"), pushState("selection")),
        on(start, ...name, classify(keywordTable(["on"], "keyword"), [paint("type")])),
      ],
    },
    selection: {
      style: "plain",
      arms: [
        comment,
        directive,
        token("...", "punctuation.special", pushState("spread")),
        token("(", "punctuation.bracket", pushState("arguments")),
        token("{", "punctuation.bracket", pushState("selection")),
        token("}", "punctuation.bracket", popState()),
        token(":", "punctuation.delimiter"),
        on(start, ...name, paint("property")),
      ],
    },
    spread: {
      style: "plain",
      arms: [
        space,
        comment,
        on("o", literal("on"), notNext(rest), paint("keyword"), setState("spreadType")),
        on(start, ...name, paint("label"), popState()),
      ],
      otherwise: [popState()],
    },
    spreadType: {
      style: "plain",
      arms: [space, comment, on(start, ...name, paint("type"), popState())],
      otherwise: [popState()],
    },
    variableName: {
      style: "plain",
      arms: [space, comment, on(start, ...name, paint("variable"), popState())],
      otherwise: [popState()],
    },
    directiveName: {
      style: "plain",
      arms: [space, comment, on(start, ...name, paint("attribute"), setState("afterDirective"))],
      otherwise: [popState()],
    },
    afterDirective: {
      style: "plain",
      arms: [
        space,
        comment,
        token("(", "punctuation.bracket", setState("directiveDone"), pushState("arguments")),
      ],
      otherwise: [popState()],
    },
    directiveDone: { style: "plain", arms: [], otherwise: [popState()] },
    arguments: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...argumentsContent],
    },
    object: {
      style: "plain",
      arms: [token("}", "punctuation.bracket", popState()), ...argumentsContent],
    },
    list: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", popState()),
        ...literals,
        valueName,
        token("[", "punctuation.bracket", pushState("list")),
        token("{", "punctuation.bracket", pushState("object")),
      ],
    },
    argumentProbe: {
      style: "plain",
      arms: [
        space,
        comment,
        on(":", literal(":"), patchRecord("property"), paint("punctuation.delimiter"), popState()),
      ],
      otherwise: [popState()],
    },
    variableDefinitions: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...definitionsContent],
    },
    definitionFields: {
      style: "plain",
      arms: [
        token("}", "punctuation.bracket", popState(), setState("root")),
        ...definitionsContent,
      ],
    },
    definitionArguments: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...definitionsContent],
    },
    typeRef: {
      style: "plain",
      arms: [
        space,
        comment,
        token("[", "punctuation.bracket"),
        on(start, ...name, paint("type"), setState("afterType")),
      ],
      otherwise: [popState()],
    },
    afterType: {
      style: "plain",
      arms: [space, comment, token(oneOf("!]"), "punctuation.bracket")],
      otherwise: [popState()],
    },
    defaultValue: {
      style: "plain",
      arms: [
        space,
        comment,
        token("[", "punctuation.bracket", setState("defaultDone"), pushState("list")),
        token("{", "punctuation.bracket", setState("defaultDone"), pushState("object")),
        token('"""', "string", setState("defaultDone"), pushState("blockString")),
        token('"', "string", setState("defaultDone"), pushState("string")),
        on("-0123456789", ...number.match, paint("number"), popState()),
        on(start, ...name, paint("constant.builtin"), popState()),
      ],
      otherwise: [popState()],
    },
    defaultDone: { style: "plain", arms: [], otherwise: [popState()] },
    comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\r\n", popState())],
    },
    blockString: {
      style: "string",
      arms: [token('\\"""', "string.escape"), token('"""', "string", popState())],
    },
  },
});
