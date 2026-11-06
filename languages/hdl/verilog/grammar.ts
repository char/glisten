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
  literal,
  lookahead,
  notNext,
  notLookahead,
  on,
  oneOf,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  repeat,
  token,
  union,
} from "#/grammar/mod.ts";

const digit = range("0", "9");
const upper = range("A", "Z");
const start = union("_", range("a", "z"), upper);
const rest = union(start, digit, "$");
const ident = [byte(start), bytes(rest, { min: 0 })];
const all = byteSet({ ranges: [[0, 255]] });
const nonSpace = except(all, " \t\r\n\f\v");
const digits = union(digit, "_");
const basedDigits = union(digit, range("a", "f"), range("A", "F"), "xXzZ?_");
const keywords =
  `accept_on alias always always_comb always_ff always_latch and assert assign assume automatic before begin bind bins binsof break buf bufif0 bufif1 case casex casez cell checker clocking cmos config const constraint context continue cover covergroup coverpoint cross deassign default defparam design disable dist do edge else end endcase endchecker endclass endclocking endconfig endfunction endgenerate endgroup endinterface endmodule endpackage endprimitive endprogram endproperty endspecify endsequence endtable endtask enum event eventually expect export extends extern final first_match for force foreach forever fork forkjoin function generate genvar global highz0 highz1 if iff ifnone ignore_bins illegal_bins implements implies import incdir include initial inout input inside instance interconnect intersect join join_any join_none large let liblist library local localparam macromodule matches medium modport module nand negedge nettype new nexttime nmos nor noshowcancelled null not notif0 notif1 or output package packed parameter pmos posedge primitive priority program property protected pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect pure rand randc randcase randsequence rcmos ref reject_on release repeat restrict return rnmos rpmos rtran rtranif0 rtranif1 s_always s_eventually s_nexttime s_until s_until_with scalared sequence showcancelled signed small soft solve specify specparam static strong strong0 strong1 super supply0 supply1 sync_accept_on sync_reject_on table tagged task this throughout timeprecision timeunit tran tranif0 tranif1 tri tri0 tri1 triand trior trireg type typedef union unique unique0 unsigned until until_with untyped use uwire var vectored virtual wait wait_order wand weak weak0 weak1 while wildcard wire with within wor xnor xor`.split(
    /\s+/,
  );
const types =
  `bit byte chandle int integer logic longint shortint shortreal real realtime reg string time void`.split(
    /\s+/,
  );
const typeWords = new Set(types);
const declarationWords = [
  "module",
  "macromodule",
  "interface",
  "package",
  "class",
  "program",
  "checker",
];
const keywordCases = [
  ...declarationWords.map((text) => ({
    text,
    then: [paint("keyword" as const), pushState("declarationName")],
  })),
  ...keywordTable(
    [...keywords, "struct"].filter(
      (word) => !typeWords.has(word) && !declarationWords.includes(word),
    ),
    "keyword",
  ),
  ...keywordTable([...typeWords], "type"),
];
const directives = new Set(
  `begin_keywords celldefine default_nettype define else elsif end_keywords endcelldefine endif ifdef ifndef include line nounconnected_drive pragma resetall timescale unconnected_drive undef undefineall`.split(
    /\s+/,
  ),
);
const directiveCases = [...directives].map((text) => ({
  text: `\`${text}`,
  then: [paint("keyword" as const)],
}));
const comments = [
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const number = on(
  "'0123456789",
  choice(
    [
      optional(bytes(digits)),
      bytes(" \t", { min: 0 }),
      literal("'"),
      optional(byte("sS")),
      byte("bBoOdDhH"),
      bytes(" \t", { min: 0 }),
      bytes(basedDigits),
    ],
    [literal("'"), byte("01xXzZ"), notNext(rest)],
    [
      bytes(digits),
      optional(literal("."), byte(digit), bytes(digits, { min: 0 })),
      optional(byte("eE"), optional(byte("+-")), bytes(digits)),
      optional(
        choice(
          [literal("step")],
          [literal("ms")],
          [literal("us")],
          [literal("ns")],
          [literal("ps")],
          [literal("fs")],
          [literal("s")],
        ),
        notNext(rest),
      ),
    ],
  ),
  paint("number"),
);
const basic = [
  ...comments,
  token('"', "string", pushState("string")),
  on("$", literal("$"), ...ident, paint("function")),
  on("`", literal("`"), ...ident, classify(directiveCases, [paint("function")])),
  on("\\", literal("\\"), bytes(nonSpace), paint("variable")),
  number,
  on(
    ".",
    literal("."),
    lookahead(...ident, bytes(" \t\r\n", { min: 0 }), literal("(")),
    paint("punctuation.delimiter"),
    pushState("portName"),
  ),
  on(
    start,
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal("(")),
    classify(keywordCases, [paint("function")]),
  ),
  on(start, ...ident, classify(keywordCases, [paint("variable")])),
  ...[
    "<<<",
    ">>>",
    "===",
    "!==",
    "==?",
    "!=?",
    "<<=",
    ">>=",
    "|->",
    "|=>",
    "->>",
    "<->",
    "##",
    "<=",
    ">=",
    "==",
    "!=",
    "&&",
    "||",
    "<<",
    ">>",
    "->",
    "=>",
    "**",
    "~&",
    "~|",
    "~^",
    "^~",
    "+:",
    "-:",
    "::",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "++",
    "--",
  ].map((op) => token(op, "operator")),
  token(oneOf("+-*/%=!<>&|^~?#@"), "operator"),
  token(oneOf("()[]{}"), "punctuation.bracket"),
  token(oneOf(".,;:'"), "punctuation.delimiter"),
];

export default defineGrammar({
  name: "verilog",
  aliases: ["systemverilog", "sv", "svh"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on(
          "(",
          literal("(*"),
          notLookahead(bytes(" \t\r\n", { min: 0 }), literal(")")),
          paint("punctuation.special"),
          pushState("attribute"),
        ),
        ...basic,
      ],
    },
    attribute: {
      style: "plain",
      arms: [
        token("*)", "punctuation.special", popState()),
        ...comments,
        token('"', "string", pushState("string")),
        number,
        on(start, ...ident, paint("attribute")),
        token(oneOf("=+-*/"), "operator"),
        token(oneOf(",;"), "punctuation.delimiter"),
        token(oneOf("()[]{}"), "punctuation.bracket"),
      ],
    },
    declarationName: {
      style: "plain",
      arms: [
        ...comments,
        on(
          start,
          ...ident,
          classify(keywordTable(["automatic", "static", "class"], "keyword"), [
            paint("type"),
            popState(),
          ]),
        ),
        on("\\", literal("\\"), bytes(nonSpace), paint("type"), popState()),
        redispatch(";(){}", popState()),
      ],
    },
    portName: {
      style: "plain",
      arms: [on(start, ...ident, paint("variable.member"), popState())],
      otherwise: [popState()],
    },
    lineComment: { style: "comment", arms: [redispatch("\n\r", popState())] },
    blockComment: { style: "comment", arms: [token("*/", "comment", popState())] },
    string: {
      style: "string",
      arms: [
        on(
          "\\",
          literal("\\"),
          choice(
            [byte("01234567"), optional(byte("01234567")), optional(byte("01234567"))],
            [character()],
          ),
          paint("string.escape"),
        ),
        token('"', "string", popState()),
        redispatch("\n\r", popState()),
      ],
    },
  },
});
