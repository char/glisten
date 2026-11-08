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
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const alpha = union(range("a", "z"), range("A", "Z"));
const identStart = union(alpha, "_");
const ident = union(identStart, digit);
const name = union(alpha, digit, ",._+?#-");
const hex = union(digit, range("a", "f"), range("A", "F"));
const all = byteSet({ ranges: [[0, 255]] });
const spaces = bytes(" \t\r\n", { min: 0 });
const directiveNames = `
  include include_next define undef if ifdef ifndef elif elifdef elifndef else endif error warning
  pragma line
`
  .trim()
  .split(/\s+/);
const directiveStart = lookahead(
  bytes(" \t", { min: 0 }),
  choice(...directiveNames.map((name) => [literal(name), notNext(union(ident, "-"))])),
);
const directiveHead = [
  on(" \t", lineStart(), bytes(" \t"), paint("plain"), pushState("lineIndent")),
  on("#", lineStart(), literal("#"), directiveStart, paint("keyword"), pushState("directiveName")),
];
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const escape = on(
  "\\",
  literal("\\"),
  choice([literal("x"), bytes(hex)], [bytes("01234567", { min: 1, max: 3 })], [character()]),
  paint("string.escape"),
);
const strings = [
  token('"', "string", pushState("string")),
  token("'", "string", pushState("char")),
];
const number = on(
  digit,
  choice([literal("0x"), bytes(hex)], [literal("0X"), bytes(hex)], [bytes(digit)]),
  bytes("uUlL", { min: 0 }),
  paint("number"),
);
const reference = [
  on("&", literal("&{"), bytes(except(all, "}\r\n")), literal("}"), paint("variable")),
  on("&", literal("&"), byte(identStart), bytes(ident, { min: 0 }), paint("variable")),
];
const operators = [
  ...["<<", ">>", "<=", ">=", "==", "!=", "&&", "||"].map((op) => token(op, "operator")),
  token(oneOf("+-*/%~!&|^?:="), "operator"),
];
const words = on(identStart, byte(identStart), bytes(ident, { min: 0 }), paint("variable"));
const expression = [...comments, ...strings, number, words, ...operators];
const slashDirectives = `
  /dts-v1/ /plugin/ /include/ /incbin/ /delete-node/ /delete-property/ /omit-if-no-ref/ /bits/
`
  .trim()
  .split(/\s+/)
  .map((s) => token(s, "keyword"));

export default defineGrammar({
  name: "devicetree",
  aliases: ["dts", "dtsi", "device-tree"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        ...directiveHead,
        ...comments,
        token("/memreserve/", "keyword", pushState("memoryReservation")),
        ...slashDirectives,
        ...reference,
        ...strings,
        on(
          identStart,
          byte(identStart),
          bytes(ident, { min: 0 }),
          lookahead(spaces, literal(":")),
          paint("label"),
        ),
        // Comments between a name and its delimiter are not included in this lookahead.
        on(
          name,
          bytes(name),
          lookahead(spaces, choice([literal("@")], [literal("{")])),
          paint("variable"),
        ),
        on(
          name,
          bytes(name),
          lookahead(spaces, choice([literal("=")], [literal(";")])),
          paint("property"),
        ),
        token("@", "punctuation.special", pushState("unitAddress")),
        token("<", "punctuation.bracket", pushState("cells")),
        token("[", "punctuation.bracket", pushState("byteArray")),
        number,
        words,
        token(oneOf("{}()"), "punctuation.bracket"),
        token(oneOf(";,:"), "punctuation.delimiter"),
        token("=", "operator"),
      ],
    },
    lineIndent: {
      style: "plain",
      arms: [
        on(
          "#",
          literal("#"),
          directiveStart,
          paint("keyword"),
          popState(),
          pushState("directiveName"),
        ),
      ],
      otherwise: [popState()],
    },
    memoryReservation: {
      style: "plain",
      arms: [
        ...directiveHead,
        token(";", "punctuation.delimiter", popState()),
        ...comments,
        number,
        words,
      ],
    },
    unitAddress: {
      style: "plain",
      arms: [on(name, bytes(name), paint("tag"), popState())],
      otherwise: [popState()],
    },
    cells: {
      style: "plain",
      arms: [
        ...directiveHead,
        token(">", "punctuation.bracket", popState()),
        token("(", "punctuation.bracket", pushState("cellExpression")),
        ...reference,
        ...expression,
        token(oneOf(",:"), "punctuation.delimiter"),
      ],
    },
    cellExpression: {
      style: "plain",
      arms: [
        ...directiveHead,
        token("(", "punctuation.bracket", pushState("cellExpression")),
        token(")", "punctuation.bracket", popState()),
        ...expression,
        token("<", "operator"),
        token(">", "operator"),
        token(",", "punctuation.delimiter"),
      ],
    },
    byteArray: {
      style: "string",
      arms: [
        ...directiveHead,
        token("]", "punctuation.bracket", popState()),
        ...comments,
        on(
          identStart,
          byte(identStart),
          bytes(ident, { min: 0 }),
          lookahead(spaces, literal(":")),
          paint("label"),
        ),
        token(":", "punctuation.delimiter"),
      ],
    },
    directiveName: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        on(
          identStart,
          byte(identStart),
          bytes(ident, { min: 0 }),
          classify(
            [
              { text: "include", then: [paint("keyword"), setState("include")] },
              ...keywordTable(
                directiveNames.filter((s) => s !== "include"),
                "keyword",
                () => [setState("directive")],
              ),
            ],
            [paint("keyword"), setState("directive")],
          ),
        ),
        token("\n", "plain", popState()),
      ],
      otherwise: [setState("directive")],
    },
    include: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("<", "string", setState("directive"), pushState("header")),
        token('"', "string", setState("directive"), pushState("string")),
      ],
      otherwise: [setState("directive")],
    },
    directive: {
      style: "plain",
      arms: [
        token("\\\r\n", "plain"),
        token("\\\n", "plain"),
        token("\n", "plain", popState()),
        ...expression,
        token(oneOf("(){}[]"), "punctuation.bracket"),
        token(oneOf(";,"), "punctuation.delimiter"),
        token("<", "operator"),
        token(">", "operator"),
      ],
    },
    header: {
      style: "string",
      arms: [token(">", "string", popState()), redispatch("\n", popState())],
    },
    string: {
      style: "string",
      arms: [escape, token('"', "string", popState()), redispatch("\n", popState())],
    },
    char: {
      style: "string",
      arms: [escape, token("'", "string", popState()), redispatch("\n", popState())],
    },
    lineComment: {
      style: "comment",
      arms: [token("\\\n", "comment"), redispatch("\n", popState())],
    },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
  },
});
