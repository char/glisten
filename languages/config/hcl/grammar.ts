import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notLookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  shell,
  token,
  union,
} from "#/grammar/mod.ts";

const high = byteSet({ ranges: [[128, 255]] });
const digit = range("0", "9");
const first = union(range("a", "z"), range("A", "Z"), "_", high);
const rest = union(first, digit, "-");
const hex = union(digit, range("a", "f"), range("A", "F"));
const name = [byte(first), bytes(rest, { min: 0 })];
const space = " \t";
const gap = repeat(
  choice(
    [bytes(space)],
    [literal("/*"), repeat(notLookahead(literal("*/")), character()), literal("*/")],
  ),
);
const comment = [
  token("#", "comment", pushState("lineComment")),
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const template = [
  token("$${", "string.escape"),
  token("%%{", "string.escape"),
  token("${~", "punctuation.special", pushState("templateExpr")),
  token("${", "punctuation.special", pushState("templateExpr")),
  token("%{~", "punctuation.special", pushState("templateDirective")),
  token("%{", "punctuation.special", pushState("templateDirective")),
];
// Non-ASCII bytes are accepted in identifiers without checking Unicode ID_Start/ID_Continue.
// Contextual for/in/if words are highlighted in expressions even when used as names.
// Object keys followed by ':' are styled as variables, not properties.
const expression = () => [
  ...comment,
  on(
    "<",
    literal("<<-"),
    lookahead(...name, optional(literal("\r")), literal("\n")),
    paint("punctuation.special"),
    shell.queueEnter(),
    shell.captureReset(),
    pushState("indentHeader"),
  ),
  on(
    "<",
    literal("<<"),
    lookahead(...name, optional(literal("\r")), literal("\n")),
    paint("punctuation.special"),
    shell.queueEnter(),
    shell.captureReset(),
    pushState("heredocHeader"),
  ),
  token('"', "string", pushState("quoted")),
  token("[", "punctuation.bracket", pushState("square")),
  token("(", "punctuation.bracket", pushState("paren")),
  token("{", "punctuation.bracket", pushState("curly")),
  on(
    "0123456789",
    bytes(digit),
    optional(literal("."), bytes(digit)),
    optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    paint("number"),
  ),
  on(first, ...name, lookahead(gap, literal("="), notNext("=>")), paint("property")),
  on(
    first,
    ...name,
    repeat(literal("::"), ...name),
    lookahead(gap, literal("(")),
    paint("function"),
  ),
  on(
    first,
    ...name,
    classify(
      [
        ...["true", "false", "null"].map((text) => ({ text, then: [paint("constant.builtin")] })),
        ...["for", "in", "if"].map((text) => ({ text, then: [paint("keyword")] })),
      ],
      [paint("variable")],
    ),
  ),
  token("...", "punctuation.special"),
  token(".*", "operator"),
  token(".", "punctuation.delimiter", pushState("member")),
  ...[
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "=>",
    "+",
    "-",
    "*",
    "/",
    "%",
    "!",
    "<",
    ">",
    "=",
    "?",
    ":",
  ].map((op) => token(op, "operator")),
  token(",", "punctuation.delimiter"),
];
// Heredoc delimiters use the 256-byte shell capture. Longer identifiers do not close.
const footer = (indentation: "exact" | "indented") =>
  on(
    indentation === "indented" ? union(first, " ") : first,
    lineStart(),
    ...(indentation === "indented" ? [bytes(" ", { min: 0 })] : []),
    shell.queueText(),
    optional(literal("\r")),
    lineEnd(),
    paint("label"),
    shell.queueLeave(),
    popState(),
  );

export default defineGrammar({
  name: "hcl",
  extensions: ["hcl", "tf", "tfvars", "nomad"],
  aliases: ["terraform", "tf", "tfvars", "hcl2"],
  initial: "body",
  states: {
    body: {
      style: "plain",
      arms: [
        ...comment,
        on(
          first,
          ...name,
          lookahead(gap, literal("="), notNext("=>")),
          paint("property"),
          setState("assign"),
        ),
        on(first, ...name, paint("keyword"), setState("blockHeader")),
        token("}", "punctuation.bracket"),
      ],
    },
    assign: { style: "plain", arms: [...comment, token("=", "operator", setState("lineExpr"))] },
    blockHeader: {
      style: "plain",
      arms: [
        ...comment,
        token('"', "string", pushState("blockLabel")),
        on(first, ...name, paint("label")),
        token("{", "punctuation.bracket", setState("body")),
      ],
    },
    // Label escapes are not validated; expression escapes check their spelling,
    // but do not reject Unicode surrogate or out-of-range code points.
    blockLabel: {
      style: "string",
      arms: [
        on("\\", literal("\\"), character(), paint("string.escape")),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    lineExpr: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("body")),
        token("}", "punctuation.bracket", setState("body")),
        ...expression(),
      ],
    },
    square: {
      style: "plain",
      arms: [token("]", "punctuation.bracket", popState()), ...expression()],
    },
    paren: {
      style: "plain",
      arms: [token(")", "punctuation.bracket", popState()), ...expression()],
    },
    curly: {
      style: "plain",
      arms: [token("}", "punctuation.bracket", popState()), ...expression()],
    },
    templateExpr: {
      style: "plain",
      arms: [
        token("~}", "punctuation.special", popState()),
        token("}", "punctuation.special", popState()),
        ...expression(),
      ],
    },
    templateDirective: {
      style: "plain",
      arms: [
        token("~}", "punctuation.special", popState()),
        token("}", "punctuation.special", popState()),
        ...["else", "endif", "endfor"].map((word) =>
          on(word[0]!, literal(word), notNext(rest), paint("keyword")),
        ),
        ...expression(),
      ],
    },
    member: {
      style: "plain",
      arms: [on(first, ...name, paint("variable.member"), popState())],
      otherwise: [popState()],
    },
    quoted: {
      style: "string",
      arms: [
        ...template,
        on(
          "\\",
          literal("\\"),
          choice(
            [byte('nrt"\\')],
            [literal("u"), bytes(hex, { min: 4, max: 4 })],
            [literal("U"), bytes(hex, { min: 8, max: 8 })],
          ),
          paint("string.escape"),
        ),
        token("\\", "error"),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    heredocHeader: {
      style: "plain",
      arms: [on(first, ...name, paint("label"), shell.captureAppend(), setState("heredocWait"))],
    },
    indentHeader: {
      style: "plain",
      arms: [on(first, ...name, paint("label"), shell.captureAppend(), setState("indentWait"))],
    },
    heredocWait: {
      style: "plain",
      arms: [redispatch("\r\n", shell.queueSave(), setState("heredoc"))],
    },
    indentWait: {
      style: "plain",
      arms: [redispatch("\r\n", shell.queueSave(), setState("indentHeredoc"))],
    },
    heredoc: { style: "string", arms: [footer("exact"), ...template] },
    indentHeredoc: { style: "string", arms: [footer("indented"), ...template] },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
  },
});
