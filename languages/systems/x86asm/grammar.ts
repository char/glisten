import {
  byte,
  bytes,
  byteSet,
  choice,
  classify,
  defineGrammar,
  except,
  keywordTable,
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
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const start = union("_.$?@", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const hex = union(digit, range("a", "f"), range("A", "F"), "_");
const registers = [
  ...`
    al ah ax eax rax bl bh bx ebx rbx cl ch cx ecx rcx dl dh dx edx rdx sil si esi rsi dil di
    edi rdi bpl bp ebp rbp spl sp esp rsp ip eip rip cs ds es fs gs ss eflags rflags mxcsr st
    mm0 mm1 mm2 mm3 mm4 mm5 mm6 mm7 cr0 cr2 cr3 cr4 cr8 dr0 dr1 dr2 dr3 dr6 dr7
  `
    .trim()
    .split(/\s+/),
  ...Array.from({ length: 8 }, (_, n) => `k${n}`),
  ...Array.from({ length: 32 }, (_, n) => [`xmm${n}`, `ymm${n}`, `zmm${n}`]).flat(),
  ...Array.from({ length: 8 }, (_, n) => [
    `r${n + 8}`,
    `r${n + 8}d`,
    `r${n + 8}w`,
    `r${n + 8}b`,
  ]).flat(),
  ...Array.from({ length: 8 }, (_, n) => `st${n}`),
];
const sizes = `
    byte word dword qword tword oword yword zword ptr short near far strict rel abs offset flat
  `
  .trim()
  .split(/\s+/);
const directives = `
  section segment global extern common static default bits cpu org align alignb absolute struc
  endstruc istruc at iend db dw dd dq dt do dy dz resb resw resd resq rest reso resy resz incbin
  times equ use16 use32 use64 group import export library end assume proc endp public extrn
  macro endm rept endr include includelib option title subtitle name page model code data const
  stack
`
  .trim()
  .split(/\s+/);
const instructionPrefixes = `lock rep repe repz repne repnz bnd xacquire xrelease notrack`
  .trim()
  .split(/\s+/);
const registerCases = keywordTable(registers, "constant.builtin");
const number = on(
  "0123456789",
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("bB"), bytes(union("01", "_"))],
    [literal("0"), byte("qQoO"), bytes(union("01234567", "_"))],
    [byte(digit), bytes(hex, { min: 0 }), byte("hH")],
    [bytes(union(digit, "_")), optional(byte("dD"))],
  ),
  paint("number"),
);
const comments = [
  token(";", "comment", pushState("lineComment")),
  token("#", "comment", pushState("lineComment")),
  token("//", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const operands = [
  ...comments,
  token('"', "string", pushState("doubleString")),
  token("'", "string", pushState("singleString")),
  token("`", "string", pushState("backtickString")),
  on("$", literal("$"), lookahead(byte(digit)), paint("operator")),
  token("$$", "constant.builtin"),
  on("$", literal("$"), notNext(rest), paint("constant.builtin")),
  on(
    "%",
    literal("%"),
    ...ident,
    classify(
      keywordTable(
        registers.map((name) => `%${name}`),
        "constant.builtin",
      ),
      [paint("variable")],
      { caseless: true },
    ),
  ),
  on("%", literal("%%"), ...ident, paint("label")),
  on("%", literal("%"), bytes(digit), paint("variable")),
  number,
  on(
    start,
    ...ident,
    classify(
      [
        ...registerCases,
        ...keywordTable(sizes, "type"),
        ...keywordTable(["db", "dw", "dd", "dq", "dt", "times", "equ"], "keyword"),
      ],
      [paint("variable")],
      {
        caseless: true,
      },
    ),
  ),
  token(oneOf("[](){}"), "punctuation.bracket"),
  token(oneOf(",:"), "punctuation.delimiter"),
  token(oneOf("+-*/%&|^~!=<>$"), "operator"),
];
const labelName = choice([literal("%%"), ...ident], [...ident], [bytes(digit)]);

export default defineGrammar({
  name: "x86asm",
  extensions: ["asm", "s", "S"],
  aliases: ["asm", "nasm"],
  initial: "statement",
  states: {
    statement: {
      style: "plain",
      arms: [
        on(" \t", bytes(" \t"), paint("plain")),
        token("\n", "plain"),
        token("\r", "plain"),
        on(union(start, digit, "%"), labelName, lookahead(literal(":")), paint("label")),
        token(":", "punctuation.delimiter"),
        on(
          start,
          ...ident,
          lookahead(
            bytes(" \t"),
            choice([byte("eE"), byte("qQ"), byte("uU")], [byte("dD"), byte("bBwWdDqQ")]),
            notNext(rest),
          ),
          paint("label"),
        ),
        on(
          "#",
          literal("#"),
          bytes(" \t", { min: 0 }),
          choice(
            ...[
              "include",
              "define",
              "undef",
              "ifdef",
              "ifndef",
              "if",
              "elif",
              "else",
              "endif",
              "error",
              "pragma",
            ].map((directive) => [literal(directive)]),
          ),
          notNext(rest),
          paint("keyword"),
          setState("operands"),
        ),
        on("%", literal("%"), ...ident, paint("keyword"), setState("operands")),
        ...comments,
        on(
          ".",
          literal("."),
          byte(start),
          bytes(rest, { min: 0 }),
          paint("keyword"),
          setState("operands"),
        ),
        on(
          start,
          ...ident,
          classify(
            [
              ...keywordTable(instructionPrefixes, "keyword"),
              ...keywordTable(directives, "keyword", () => [setState("operands")]),
            ],
            [paint("function"), setState("operands")],
            { caseless: true },
          ),
        ),
      ],
    },
    operands: {
      style: "plain",
      arms: [
        token("\n", "plain", setState("statement")),
        token("\r", "plain", setState("statement")),
        ...operands,
      ],
    },
    lineComment: { style: "comment", arms: [redispatch("\r\n", popState())] },
    blockComment: {
      style: "comment",
      arms: [
        token("*/", "comment", popState()),
        token("\n", "comment", setState("blockCommentLine")),
        token("\r", "comment", setState("blockCommentLine")),
      ],
    },
    blockCommentLine: {
      style: "comment",
      arms: [token("*/", "comment", popState(), setState("statement"))],
    },
    doubleString: {
      style: "string",
      arms: [
        token('\\"', "string.escape"),
        token("\\\\", "string.escape"),
        token('"', "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    singleString: {
      style: "string",
      arms: [
        token("\\'", "string.escape"),
        token("\\\\", "string.escape"),
        token("'", "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
    backtickString: {
      style: "string",
      arms: [
        on("\\", literal("\\"), byte(except(all, "\r\n")), paint("string.escape")),
        token("`", "string", popState()),
        redispatch("\r\n", popState()),
      ],
    },
  } satisfies Record<string, State>,
});
