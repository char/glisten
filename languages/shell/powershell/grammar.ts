import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  except,
  lineStart,
  literal,
  lookahead,
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
  type Arm,
  type Effect,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const nonAscii = byteSet({ ranges: [[128, 255]] });
const letter = union(range("a", "z"), range("A", "Z"), "_", nonAscii);
const digit = range("0", "9");
const word = union(letter, digit, "-");
const variableName = union(letter, digit, ":");
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const keywords =
  "begin break catch class clean configuration continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in inlinescript parallel param process return sequence switch throw trap try until using var while workflow".split(
    " ",
  );
const comparisons =
  "eq ne gt ge lt le like notlike match notmatch contains notcontains in notin replace split".split(
    " ",
  );
const operators = [
  ...comparisons,
  ...comparisons.flatMap((x) => [`i${x}`, `c${x}`]),
  ..."and or xor not band bor bxor bnot shl shr as is isnot join f".split(" "),
].map((x) => `-${x}`);
const helpKeywords =
  "synopsis description example inputs outputs notes link component role functionality parameter forwardhelptargetname forwardhelpcategory remotehelprunspace externalhelp"
    .split(" ")
    .map((x) => `.${x}`);
const attributes =
  "alias allowemptycollection allowemptystring allownull argumentcompleter cmdletbinding credential dscproperty dsclocalconfigurationmanager outputtype parameter pstypename supports wildcards validatecount validatedrive validatelength validatenotnull validatenotnullorempty validatepattern validaterange validatescript validateset validateuserdrive".split(
    " ",
  );
const escape = on(
  "`",
  literal("`"),
  choice([literal("\r\n")], [character()]),
  paint("string.escape"),
);
const help = on(
  ".",
  literal("."),
  bytes(letter),
  notNext(word),
  classify(
    helpKeywords.map((text) => ({ text, then: [paint("keyword")] })),
    [paint("comment")],
    { caseless: true },
  ),
);

function variables(after: readonly Effect[] = []): Arm[] {
  return [
    on("$", literal("$("), paint("punctuation.special"), ...after, pushState("command")),
    on("$", literal("${"), paint("variable"), ...after, pushState("bracedVariable")),
    on(
      "$",
      literal("$"),
      bytes(variableName),
      classify(
        [
          ...["$true", "$false", "$null"].map((text) => ({
            text,
            then: [paint("constant.builtin"), ...after],
          })),
        ],
        [paint("variable"), ...after],
        { caseless: true },
      ),
    ),
    on("$", literal("$"), byte("$^?"), paint("variable"), ...after),
  ];
}

const number = on(
  digit,
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("bB"), bytes("01_")],
    [
      byte(digit),
      bytes(union(digit, "_"), { min: 0 }),
      optional(literal("."), bytes(union(digit, "_"))),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    ],
  ),
  bytes(union(letter, digit), { min: 0 }),
  notNext(union(letter, digit)),
  paint("number"),
);

function code(atCommand: boolean, inHash = false): State {
  const commandState = inHash ? "hashCommand" : "command";
  const argumentState = inHash ? "hashArguments" : "arguments";
  const after = atCommand ? [setState(argumentState)] : [];
  const keywordCases = keywords.map((text) => ({
    text,
    then: [
      paint("keyword"),
      setState(
        ["function", "filter", "workflow"].includes(text)
          ? "functionName"
          : ["class", "enum"].includes(text)
            ? "typeName"
            : [
                  "return",
                  "throw",
                  "exit",
                  "if",
                  "elseif",
                  "while",
                  "until",
                  "switch",
                  "foreach",
                  "for",
                  "catch",
                  "param",
                ].includes(text)
              ? argumentState
              : commandState,
      ),
    ],
  }));
  return {
    style: "plain",
    arms: [
      on(byteSet({ bytes: [0xef] }), lineStart(), literal("\ufeff"), paint("plain")),
      on(" \t\r", bytes(" \t\r"), paint("plain")),
      token("\n", "plain", setState(inHash ? "hashKey" : "command")),
      token("<#", "comment", pushState("blockComment")),
      token("#", "comment", pushState("lineComment")),
      escape,
      on(
        "@",
        literal('@"'),
        optional(literal("\r")),
        literal("\n"),
        paint("string"),
        ...after,
        pushState("hereDouble"),
      ),
      on(
        "@",
        literal("@'"),
        optional(literal("\r")),
        literal("\n"),
        paint("string"),
        ...after,
        pushState("hereSingle"),
      ),
      on("'", literal("'"), paint("string"), ...after, pushState("singleString")),
      on('"', literal('"'), paint("string"), ...after, pushState("doubleString")),
      ...variables(after),
      on("@", literal("@{"), paint("punctuation.special"), ...after, pushState("hashKey")),
      on("@", literal("@("), paint("punctuation.special"), ...after, pushState("command")),
      on(
        "@",
        literal("@"),
        byte(letter),
        bytes(union(letter, digit), { min: 0 }),
        paint("variable"),
        ...after,
      ),
      number,
      on(
        "-",
        literal("-"),
        byte(letter),
        bytes(word, { min: 0 }),
        classify(
          operators.map((text) => ({ text, then: [paint("operator")] })),
          [paint("attribute")],
          { caseless: true },
        ),
      ),
      on(
        "[",
        literal("["),
        lookahead(byte(letter)),
        paint("punctuation.bracket"),
        ...after,
        pushState("type"),
      ),
      on("[", literal("["), paint("punctuation.bracket"), ...after, pushState("command")),
      on("(", literal("("), paint("punctuation.bracket"), ...after, pushState("command")),
      on("{", literal("{"), paint("punctuation.bracket"), ...after, pushState("command")),
      on("])}", byte("])}"), paint("punctuation.bracket"), popState()),
      token("?.", "operator", pushState("member")),
      token("::", "operator", pushState("member")),
      on(
        ".",
        literal("."),
        lookahead(byte(letter)),
        paint("punctuation.delimiter"),
        pushState("member"),
      ),
      token("&&", "operator", setState(commandState)),
      token("||", "operator", setState(commandState)),
      token("|", "operator", setState(commandState)),
      token(";", "operator", setState(inHash ? "hashKey" : "command")),
      on("=", literal("="), paint("operator"), setState(commandState)),
      on("&", literal("&"), paint("operator"), setState(commandState)),
      on("?", choice([literal("??=")], [literal("??")], [literal("?")]), paint("operator")),
      on("+-*/%!<>:", byte("+-*/%!<>:"), optional(literal("=")), paint("operator")),
      token(oneOf(",."), "punctuation.delimiter"),
      on(
        letter,
        byte(letter),
        bytes(word, { min: 0 }),
        classify(keywordCases, [paint(atCommand ? "function" : "plain"), ...after], {
          caseless: true,
        }),
      ),
    ],
  };
}

// Command positions, type/attribute names and here-string terminators are lexical
// approximations; PowerShell evaluation and parser-driven command resolution are not performed.
const states: Record<string, State> = {
  command: code(true),
  arguments: code(false),
  hashCommand: code(true, true),
  hashArguments: code(false, true),
  hashKey: {
    style: "plain",
    arms: [
      on(" \t\r\n;", bytes(" \t\r\n;"), paint("plain")),
      token("<#", "comment", pushState("blockComment")),
      token("#", "comment", pushState("lineComment")),
      token("}", "punctuation.bracket", popState()),
      on(letter, byte(letter), bytes(word, { min: 0 }), paint("property"), setState("hashExpect")),
      on("'", literal("'"), paint("string"), setState("hashExpect"), pushState("singleString")),
      on('"', literal('"'), paint("string"), setState("hashExpect"), pushState("doubleString")),
      redispatch(all, setState("hashCommand")),
    ],
  },
  hashExpect: {
    style: "plain",
    arms: [
      on(" \t\r", bytes(" \t\r"), paint("plain")),
      token("=", "operator", setState("hashCommand")),
      redispatch(all, setState("hashCommand")),
    ],
  },
  functionName: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      on(letter, byte(letter), bytes(word, { min: 0 }), paint("function"), setState("arguments")),
      redispatch(all, setState("arguments")),
    ],
  },
  typeName: {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      on(letter, byte(letter), bytes(word, { min: 0 }), paint("type"), setState("arguments")),
      redispatch(all, setState("arguments")),
    ],
  },
  member: {
    style: "plain",
    arms: [
      on(
        letter,
        byte(letter),
        bytes(word, { min: 0 }),
        lookahead(literal("(")),
        paint("function"),
        popState(),
      ),
      on(letter, byte(letter), bytes(word, { min: 0 }), paint("variable.member"), popState()),
      redispatch(all, popState()),
    ],
  },
  type: {
    style: "type",
    arms: [
      token("]", "punctuation.bracket", popState()),
      token("[", "punctuation.bracket", pushState("type")),
      token("(", "punctuation.bracket", pushState("attributeArguments")),
      token(oneOf(",."), "punctuation.delimiter"),
      on(
        letter,
        byte(letter),
        bytes(union(letter, digit), { min: 0 }),
        classify(
          attributes.map((text) => ({ text, then: [paint("attribute")] })),
          [paint("type")],
          { caseless: true },
        ),
      ),
    ],
  },
  attributeArguments: {
    style: "plain",
    arms: [
      token(")", "punctuation.bracket", popState()),
      on(letter, byte(letter), bytes(union(letter, digit), { min: 0 }), paint("attribute")),
      ...variables(),
      number,
      escape,
      token("'", "string", pushState("singleString")),
      token('"', "string", pushState("doubleString")),
      token(oneOf(",="), "operator"),
    ],
  },
  bracedVariable: { style: "variable", arms: [escape, token("}", "variable", popState())] },
  singleString: {
    style: "string",
    arms: [token("''", "string.escape"), token("'", "string", popState())],
  },
  doubleString: {
    style: "string",
    arms: [token('""', "string.escape"), token('"', "string", popState()), escape, ...variables()],
  },
  hereSingle: {
    style: "string",
    arms: [on("'", lineStart(), literal("'@"), paint("string"), popState())],
  },
  hereDouble: {
    style: "string",
    arms: [
      on('"', lineStart(), literal('"@'), paint("string"), popState()),
      escape,
      ...variables(),
    ],
  },
  lineComment: { style: "comment", arms: [help, redispatch("\n", popState())] },
  blockComment: {
    style: "comment",
    arms: [
      token("<#", "comment", pushState("blockComment")),
      token("#>", "comment", popState()),
      help,
    ],
  },
};

export default defineGrammar({
  name: "powershell",
  aliases: ["ps1", "pwsh"],
  initial: "command",
  states,
});
