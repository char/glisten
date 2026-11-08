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
  lineEnd,
  lineStart,
  matchRun,
  literal,
  lookahead,
  notNext,
  notLookahead,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  range,
  redispatch,
  repeat,
  setState,
  shell,
  saveRun,
  slot,
  token,
  union,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union(start, digit);
const ident = [byte(start), bytes(rest, { min: 0 })];
const name = [...ident, repeat(literal("#"), ...ident)];
const hspace = bytes(" \t", { min: 0 });
const abbreviations = (min: string, full: string) =>
  Array.from({ length: full.length - min.length + 1 }, (_, i) => full.slice(0, min.length + i));
const commands = [
  ["fu", "function"],
  ["endf", "endfunction"],
  ["let", "let"],
  ["if", "if"],
  ["elsei", "elseif"],
  ["el", "else"],
  ["en", "endif"],
  ["for", "for"],
  ["endfo", "endfor"],
  ["wh", "while"],
  ["endw", "endwhile"],
  ["try", "try"],
  ["cat", "catch"],
  ["fina", "finally"],
  ["endt", "endtry"],
  ["retu", "return"],
  ["cal", "call"],
  ["aug", "augroup"],
  ["var", "var"],
  ["cons", "const"],
  ["export", "export"],
  ["import", "import"],
  ["class", "class"],
  ["endclass", "endclass"],
  ["th", "throw"],
  ["brea", "break"],
  ["con", "continue"],
  ["unl", "unlet"],
] as const;
const noArgs = new Set(
  `
    endfunction else endif endfor endwhile try finally endtry endclass break continue
  `
    .trim()
    .split(/\s+/),
);
const multi = [
  ["ec", "echo"],
  ["echon", "echon"],
  ["echom", "echomsg"],
  ["echoe", "echoerr"],
  ["exe", "execute"],
] as const;
const literalCommands = [
  ["map", "map"],
  ["no", "noremap"],
  ["nm", "nmap"],
  ["nn", "nnoremap"],
  ["lm", "lmap"],
  ["ln", "lnoremap"],
  ["unm", "unmap"],
  ["nun", "nunmap"],
  ["vu", "vunmap"],
  ["xu", "xunmap"],
  ["sunm", "sunmap"],
  ["ou", "ounmap"],
  ["iu", "iunmap"],
  ["lu", "lunmap"],
  ["cu", "cunmap"],
  ["tunma", "tunmap"],
  ["mapc", "mapclear"],
  ["nmapc", "nmapclear"],
  ["vmapc", "vmapclear"],
  ["xmapc", "xmapclear"],
  ["smapc", "smapclear"],
  ["omapc", "omapclear"],
  ["imapc", "imapclear"],
  ["lmapc", "lmapclear"],
  ["cmapc", "cmapclear"],
  ["tmapc", "tmapclear"],
  ["ab", "abbreviate"],
  ["norea", "noreabbrev"],
  ["una", "unabbreviate"],
  ["ia", "iabbrev"],
  ["ca", "cabbrev"],
  ["inorea", "inoreabbrev"],
  ["cnorea", "cnoreabbrev"],
  ["iuna", "iunabbrev"],
  ["cuna", "cunabbrev"],
  ["abc", "abclear"],
  ["iabc", "iabclear"],
  ["cabc", "cabclear"],
  ["im", "imap"],
  ["ino", "inoremap"],
  ["vm", "vmap"],
  ["vn", "vnoremap"],
  ["xm", "xmap"],
  ["xn", "xnoremap"],
  ["smap", "smap"],
  ["snor", "snoremap"],
  ["om", "omap"],
  ["ono", "onoremap"],
  ["tma", "tmap"],
  ["tno", "tnoremap"],
  ["cm", "cmap"],
  ["cno", "cnoremap"],
] as const;
const textCommands = [
  ["norm", "normal"],
  ["com", "command"],
  ["au", "autocmd"],
] as const;
const expand = (pairs: readonly (readonly [string, string])[]) =>
  pairs.flatMap(([a, b]) => abbreviations(a, b));
type Dialect = "legacy" | "vim9";
type Group = "top" | "round" | "square" | "brace";
const expr = (d: Dialect, g: Group, expect: boolean, many: boolean) => {
  const multi = d === "legacy" && many;
  const operand = expect && !multi && (d === "legacy" || g === "top");
  return `${d}_${g}_${operand ? "expect" : "after"}_${multi ? "many" : "one"}`;
};
const command = (d: Dialect) => `${d}_command`;
const commandLine = (d: Dialect) => `${d}_line`;
const space = bytes(" \t\r\n", { min: 0 });
const op = choice(
  ...[
    "==#",
    "==?",
    "!=#",
    "!=?",
    "=~#",
    "=~?",
    "!~#",
    "!~?",
    "isnot#",
    "isnot?",
    "is#",
    "is?",
    "<=#",
    "<=?",
    ">=#",
    ">=?",
    "==",
    "!=",
    "=~",
    "!~",
    "<=",
    ">=",
    "&&",
    "||",
    "..",
    "->",
    "=>",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    ".=",
    "=",
    "+",
    "-",
    "*",
    "/",
    "%",
    ".",
    "<",
    ">",
    "!",
    "?",
    ":",
  ].map((x) => [literal(x)]),
);
const number = (d: Dialect) =>
  choice(
    [literal("0"), byte("xX"), bytes(hex)],
    [literal("0"), byte("bB"), bytes("01")],
    [literal("0"), byte("oO"), bytes(range("0", "7"))],
    [
      bytes(digit),
      ...(d === "vim9" ? [repeat(literal("'"), bytes(digit))] : []),
      optional(literal("."), bytes(digit)),
      optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    ],
  );
const continuation = (d: Dialect) =>
  lookahead(hspace, choice([literal("\\")], [literal(d === "legacy" ? '"\\ ' : "#\\ ")]));
const vim9Continuation = lookahead(
  hspace,
  choice([literal("\\")], [literal("->")], [literal(".")], [byte("+-*/%<>=!&|?:")]),
);
const states: Record<string, State> = {
  lineComment: { style: "comment", arms: [redispatch("\n", popState())] },
  sharedOperator: { style: "plain", arms: [on("=<>!+-*/%.?:", op, paint("operator"), popState())] },
};
const continuationComment = (d: Dialect) =>
  on(
    d === "legacy" ? ' \t"' : " \t#",
    lineStart(),
    hspace,
    literal(d === "legacy" ? '"\\ ' : "#\\ "),
    paint("comment"),
    pushState("lineComment"),
  );

// Some :syntax and other Ex mini-languages are approximated. Continuation does
// not model 'cpoptions' or every intervening comment line. Captured heredoc
// indent plus marker is capped at 256 bytes; omitted and invalid markers are
// not fully parsed.
const patternDelimiter = slot.run("syntax-pattern");
for (const d of ["legacy", "vim9"] as const) {
  const cases = [
    ...commands.flatMap(([min, full]) =>
      abbreviations(min, full)
        .filter((text) => text !== "final")
        .map((text) => ({
          text,
          then: [paint("keyword"), setState(noArgs.has(full) ? command(d) : `${d}_start_one`)],
        })),
    ),
    ...expand([
      ["se", "set"],
      ["setl", "setlocal"],
      ["setg", "setglobal"],
    ]).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_options`)],
    })),
    ...expand([["hi", "highlight"]]).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_highlight`)],
    })),
    ...expand([["sy", "syntax"]]).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_syntax`)],
    })),
    ...expand([["vim9", "vim9cmd"]]).map((text) => ({
      text,
      then: d === "vim9" ? [paint("keyword")] : [paint("keyword"), setState(command("vim9"))],
    })),
    ...expand([["leg", "legacy"]]).map((text) => ({
      text,
      then: d === "legacy" ? [paint("keyword")] : [paint("keyword"), setState(command("legacy"))],
    })),
    ...expand(multi).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_start_many`)],
    })),
    ...expand(literalCommands).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_literal`)],
    })),
    ...expand(textCommands).map((text) => ({
      text,
      then: [paint("keyword"), setState(`${d}_text`)],
    })),
    { text: "def", then: [paint("keyword"), setState("vim9_base"), pushState("vim9_start_one")] },
    { text: "enddef", then: [paint("keyword"), popState(), popState()] },
  ];
  // The enclosing frame retains the dialect when a command modifier switches it.
  states[commandLine(d)] = {
    style: "plain",
    arms: [
      on(
        " \t",
        bytes(" \t"),
        paint("plain"),
        shell.captureReset(),
        shell.captureAppend(),
        setState(`${d}_base`),
        pushState(command(d)),
      ),
      redispatch(all, shell.captureReset(), setState(`${d}_base`), pushState(command(d))),
    ],
  };
  states[`${d}_base`] = {
    style: "plain",
    arms: [
      redispatch(all, lookahead(lineStart()), setState(commandLine(d))),
      redispatch(all, pushState(command(d))),
    ],
  };
  const endLine = [token("\n", "plain", popState())];
  const endBar = [token("|", "punctuation.delimiter", popState())];
  states[command(d)] = {
    style: "plain",
    arms: [
      on(" \t", bytes(" \t"), paint("plain")),
      token(":", "punctuation.delimiter"),
      ...endLine,
      ...endBar,

      ...(d === "legacy"
        ? [token('"', "comment", pushState("lineComment"))]
        : [token("#", "comment", pushState("lineComment"))]),
      token("!", "keyword", setState(`${d}_text`)),
      on(
        "f",
        literal("final"),
        notNext(rest),
        ...(d === "vim9" ? [notLookahead(literal("#"), ...ident)] : []),
        paint("keyword"),
        setState(d === "vim9" ? `${d}_start_one` : command(d)),
      ),
      ...(d === "legacy"
        ? [
            on(
              "v",
              literal("vim9script"),
              notNext(rest),
              paint("keyword"),
              popState(),
              setState("vim9_base"),
              pushState(command("vim9")),
            ),
          ]
        : []),
      ...(d === "vim9"
        ? [
            on(
              start,
              ...name,
              lookahead(space, literal("(")),
              classify(cases, [paint("function"), setState(expr(d, "top", false, false))]),
            ),
            on(
              start,
              ...name,
              classify(cases, [paint("variable"), setState(expr(d, "top", false, false))]),
            ),
          ]
        : [on(start, ...ident, classify(cases, [paint("plain"), setState(`${d}_literal`)]))]),
    ],
    ...(d === "vim9" ? { otherwise: [setState(expr(d, "top", true, false))] } : {}),
  };
  for (const many of [false, true]) {
    states[`${d}_start_${many ? "many" : "one"}`] = {
      style: "plain",
      arms: [on(" \t", bytes(" \t"), paint("plain")), ...endLine],
      otherwise: [setState(expr(d, "top", true, many))],
    };
  }
  states[`${d}_heredocReturn`] = { style: "plain", arms: [redispatch("\n", popState())] };
  states[`${d}_text`] = {
    style: "plain",
    arms: [
      continuationComment(d),
      on("\n", literal("\n"), continuation(d), paint("plain")),
      ...endLine,
    ],
  };
  states[`${d}_literal`] = {
    style: "plain",
    arms: [
      continuationComment(d),
      on("\n", literal("\n"), continuation(d), paint("plain")),
      ...endLine,
      token("\\|", "plain"),
      token("\u0016|", "plain"),
      ...endBar,
    ],
  };
  const argumentNewline = [
    continuationComment(d),
    on("\n", literal("\n"), continuation(d), paint("plain")),
    ...endLine,
  ];
  const argumentComment = on(
    d === "legacy" ? '"' : "#",
    previousNotIn(except(all, " \t\n")),
    literal(d === "legacy" ? '"' : "#"),
    paint("comment"),
    pushState("lineComment"),
  );
  states[`${d}_options`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      on("\\", literal("\\"), character(), paint("plain")),
      argumentComment,
      ...endBar,
    ],
  };
  states[`${d}_highlight`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      argumentComment,
      on(
        start,
        ...ident,
        classify(keywordTable(["default", "link", "clear", "NONE"], "keyword"), [paint("type")]),
      ),
      ...endBar,
    ],
  };
  const syntaxWords = keywordTable(
    `
      case clear cluster conceal include iskeyword keyword list match off on region reset spell
      sync contained transparent keepend extend oneline
    `
      .trim()
      .split(/\s+/),
    "keyword",
  );
  const syntaxPattern = on(
    except(all, " \t\r\n"),
    byte(except(all, " \t\r\n")),
    paint("string"),
    saveRun(patternDelimiter),
    setState(`${d}_syntaxPattern`),
  );
  const syntaxPatternOption = on(
    "se",
    choice([literal("start")], [literal("skip")], [literal("end")]),
    hspace,
    literal("="),
    hspace,
    paint("keyword"),
    setState(`${d}_syntaxPatternOpen`),
  );
  const syntaxEnd = [token("\\|", "plain"), ...endBar];
  const syntaxOptions = [
    syntaxPatternOption,
    on(
      start,
      ...ident,
      hspace,
      literal("="),
      bytes(except(all, " \t\r\n|"), { min: 0 }),
      paint("plain"),
    ),
    on(start, ...ident, classify(syntaxWords, [paint("type")])),
    ...syntaxEnd,
  ];
  states[`${d}_syntax`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      syntaxPatternOption,
      on(
        start,
        ...ident,
        classify(
          [
            { text: "match", then: [paint("keyword"), setState(`${d}_syntaxMatchGroup`)] },
            { text: "keyword", then: [paint("keyword"), setState(`${d}_syntaxKeywordGroup`)] },
            ...syntaxWords.filter((entry) => entry.text !== "match" && entry.text !== "keyword"),
          ],
          [paint("type")],
        ),
      ),
      ...syntaxEnd,
    ],
  };
  states[`${d}_syntaxKeywordGroup`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      on(start, ...ident, paint("type"), setState(`${d}_syntaxKeywordArgs`)),
    ],
  };
  states[`${d}_syntaxKeywordArgs`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      on(
        start,
        ...ident,
        hspace,
        literal("="),
        bytes(except(all, " \t\r\n|"), { min: 0 }),
        paint("plain"),
      ),
      on(start, ...ident, classify(syntaxWords, [paint("string")])),
      token("\\|", "plain"),
      ...endBar,
    ],
  };
  states[`${d}_syntaxMatchGroup`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      on(start, ...ident, paint("type"), setState(`${d}_syntaxMatchArgs`)),
    ],
  };
  states[`${d}_syntaxMatchArgs`] = {
    style: "plain",
    arms: [
      ...argumentNewline,
      ...syntaxOptions,
      on(
        except(except(all, rest), " \t\r\n"),
        byte(except(except(all, rest), " \t\r\n")),
        paint("string"),
        saveRun(patternDelimiter),
        setState(`${d}_syntaxPattern`),
      ),
    ],
  };
  states[`${d}_syntaxPatternOpen`] = {
    style: "plain",
    arms: [...argumentNewline, syntaxPattern],
  };
  states[`${d}_syntaxPattern`] = {
    style: "string",
    arms: [
      on("\\", literal("\\"), character(), paint("string.escape")),
      on(all, matchRun(patternDelimiter), paint("string"), setState(`${d}_syntax`)),
      ...endLine,
    ],
  };
  for (const g of ["top", "round", "square", "brace"] as const)
    for (const many of g === "top" && d === "legacy" ? [false, true] : [false])
      for (const expect of (d === "vim9" && g !== "top") || (d === "legacy" && many)
        ? [false]
        : [false, true]) {
        const current = expr(d, g, expect, many);
        const after = expr(d, g, false, many);
        const before = expr(d, g, true, many);
        const closes = { top: "", round: ")", square: "]", brace: "}" }[g];
        states[current] = {
          style: "plain",
          arms: [
            on(" \t\\", lineStart(), hspace, literal("\\"), paint("punctuation.special")),
            continuationComment(d),
            on("\n", literal("\n"), continuation(d), paint("plain")),
            ...(d === "vim9" ? [on("\n", literal("\n"), vim9Continuation, paint("plain"))] : []),
            ...(d === "vim9" && (g !== "top" || expect) ? [token("\n", "plain")] : [...endLine]),
            ...(closes ? [token(closes, "punctuation.bracket", popState())] : []),
            ...(d === "vim9"
              ? [
                  on(
                    "#",
                    previousNotIn(except(all, " \t\n")),
                    literal("#"),
                    paint("comment"),
                    pushState("lineComment"),
                  ),
                ]
              : []),
            ...(d === "legacy" && !expect && !many
              ? [token('"', "comment", pushState("lineComment"))]
              : [token('"', "string", setState(after), pushState("doubleString"))]),
            token("'", "string", setState(after), pushState("singleString")),
            on(digit, number(d), paint("number"), setState(after)),
            on(
              "&",
              literal("&"),
              optional(byte("gl"), literal(":")),
              ...ident,
              paint("variable"),
              setState(after),
            ),
            on("$", literal("$"), ...ident, paint("variable"), setState(after)),
            on("@", literal("@"), byte(except(all, "\r\n")), paint("variable"), setState(after)),
            on(
              "i",
              choice([literal("isnot")], [literal("is")]),
              optional(byte("#?")),
              notNext(rest),
              paint("operator"),
              setState(before),
            ),
            on(start, ...name, lookahead(space, literal("(")), paint("function"), setState(after)),
            on(
              start,
              optional(byte("gbwtslav"), literal(":")),
              ...name,
              classify(
                [
                  ...["true", "false", "v:true", "v:false", "v:null", "v:none"].map((text) => ({
                    text,
                    then: [paint("constant.builtin"), setState(after)],
                  })),
                  { text: "in", then: [paint("keyword"), setState(before)] },
                ],
                [paint("variable"), setState(after)],
              ),
            ),
            token(
              "#{",
              "punctuation.bracket",
              setState(after),
              pushState(expr(d, "brace", true, false)),
            ),
            ...(
              [
                ["(", "round"],
                ["[", "square"],
                ["{", "brace"],
              ] as const
            ).map(([open, group]) =>
              token(
                open,
                "punctuation.bracket",
                setState(after),
                pushState(expr(d, group, true, false)),
              ),
            ),
            token(
              "=<<",
              "operator",
              setState(`${d}_heredocReturn`),
              pushState(`${d}_heredocHeader`),
            ),
            token("||", "operator", setState(before)),
            ...(g === "top"
              ? endBar
              : [token("|", "punctuation.delimiter", popState(), setState(command(d)))]),
            token("&&", "operator", setState(before)),
            redispatch("=<>!+-*/%.?:", setState(before), pushState("sharedOperator")),
            token(",", "punctuation.delimiter", setState(before)),
            token("\\", "punctuation.special"),
          ],
        };
      }
}
states.doubleString = {
  style: "string",
  arms: [
    on("\\", literal("\\"), character(), paint("string.escape")),
    token('"', "string", popState()),
    redispatch("\n", popState()),
  ],
};
states.singleString = {
  style: "string",
  arms: [
    token("''", "string.escape"),
    token("'", "string", popState()),
    redispatch("\n", popState()),
  ],
};
for (const d of ["legacy", "vim9"] as const) {
  for (const trim of [false, true])
    for (const evaluate of [false, true]) {
      const header = `${d}_heredocHeader${trim ? "Trim" : ""}${evaluate ? "Eval" : ""}`;
      const afterMarker = `${d}_heredocAfterMarker${evaluate ? "Eval" : ""}`;
      states[header] = {
        style: "plain",
        arms: [
          on(
            except(all, " \t\r\n"),
            bytes(except(all, " \t\r\n")),
            classify(
              [
                ...(trim
                  ? []
                  : [
                      {
                        text: "trim",
                        then: [
                          paint("keyword"),
                          setState(`${d}_heredocHeaderTrim${evaluate ? "Eval" : ""}`),
                        ],
                      },
                    ]),
                {
                  text: "eval",
                  then: [paint("keyword"), setState(`${d}_heredocHeader${trim ? "Trim" : ""}Eval`)],
                },
              ],
              [
                paint("label"),
                ...(trim ? [] : [shell.captureReset()]),
                shell.captureAppend(),
                setState(afterMarker),
              ],
            ),
          ),
          token("\n", "plain", setState(evaluate ? `${d}_heredocEvalBody` : "heredocBody")),
        ],
      };
    }
  for (const evaluate of [false, true]) {
    states[`${d}_heredocAfterMarker${evaluate ? "Eval" : ""}`] = {
      style: "plain",
      arms: [
        on(
          d === "legacy" ? '"' : "#",
          previousNotIn(except(all, " \t\n")),
          literal(d === "legacy" ? '"' : "#"),
          paint("comment"),
          pushState("lineComment"),
        ),
        token("\n", "plain", setState(evaluate ? `${d}_heredocEvalBody` : "heredocBody")),
      ],
    };
  }
  states[`${d}_heredocEvalBody`] = {
    style: "string",
    arms: [
      on(all, lineStart(), shell.captured(), lineEnd(), paint("label"), popState()),
      token("{{", "string.escape"),
      token("}}", "string.escape"),
      token("{", "punctuation.bracket", pushState(expr(d, "brace", true, false))),
    ],
  };
}
states.heredocBody = {
  style: "string",
  arms: [on(all, lineStart(), shell.captured(), lineEnd(), paint("label"), popState())],
};

export default defineGrammar({
  name: "vim",
  extensions: ["vim"],
  filenames: [".vimrc", ".gvimrc", "vimrc", "gvimrc"],
  aliases: ["vimscript", "viml"],
  initial: commandLine("legacy"),
  states,
});
