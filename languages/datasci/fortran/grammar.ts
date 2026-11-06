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
  type Arm,
  type ByteSet,
  type State,
} from "#/grammar/mod.ts";

export type FortranExtension = {
  name: string;
  aliases?: readonly string[];
  columnLimit?: number;
  lineRules?: (code: readonly Arm[]) => { initial: string; states: Record<string, State> };
};

export function fortran(extension: FortranExtension = { name: "fortran" }) {
  const digit = range("0", "9");
  const letter = union(range("a", "z"), range("A", "Z"));
  const rest = union(letter, digit, "_");
  const all = byteSet({ ranges: [[0, 255]] });
  const nonNewline = except(all, "\r\n");
  const keywords =
    "program end endprogram module endmodule submodule endsubmodule subroutine endsubroutine function endfunction use only implicit none contains interface endinterface abstract type endtype class if then else elseif endif do enddo concurrent while select endselect case is default where elsewhere endwhere forall endforall associate endassociate block endblock call return stop error allocate deallocate intent in out inout allocatable pointer target parameter dimension optional save pure elemental recursive impure print write read open close format result import public private procedure generic final pass nopass deferred non_overridable extends bind value contiguous asynchronous volatile protected external intrinsic data common equivalence namelist include cycle exit go goto continue entry selectcase selecttype selectrank rank endblockdata blockdata sync all images memory critical endcritical lock unlock event post wait team changeteam endteam form fail image stat errmsg source mold kind len doubleprecision enum enumerator endenum selectrank endselectrank do concurrent local local_init shared reduce locality pure recursive non_recursive moduleprocedure".split(
      " ",
    );
  const unique = [...new Set(keywords)];
  const words = [
    ...keywordTable(unique, "keyword"),
    ...keywordTable(
      ["integer", "real", "complex", "logical", "character", "double", "precision"],
      "type",
    ),
  ];
  const run = (set: ByteSet, min = 1) => bytes(set, { min, untilColumn: extension.columnLimit });
  const one = (set: ByteSet) =>
    extension.columnLimit === undefined
      ? byte(set)
      : bytes(set, { max: 1, untilColumn: extension.columnLimit });
  const name = [one(letter), run(rest, 0)];
  const exponent = [one("eEdDqQ"), optional(one("+-")), run(digit)];
  const suffix = optional(one("_"), run(rest));
  const number = on(
    union(digit, "."),
    choice(
      [run(digit), one("."), run(digit, 0), ...exponent, suffix],
      [run(digit), one("."), run(digit, 0), notNext(letter), suffix],
      [one("."), run(digit), optional(...exponent), suffix],
      [run(digit), optional(...exponent), suffix],
    ),
    paint("number"),
  );
  const boz = on(
    "bBoOzZ",
    one("bBoOzZ"),
    choice([one("'"), run(rest), one("'")], [one('"'), run(rest), one('"')]),
    paint("number"),
  );
  const dot = on(
    ".",
    one("."),
    one(letter),
    run(letter, 0),
    one("."),
    classify(keywordTable([".true.", ".false."], "constant.builtin"), [paint("operator")], {
      caseless: true,
    }),
  );
  const code = [
    token("!", "comment", pushState("comment")),
    boz,
    token("'", "string", pushState("singleString")),
    token('"', "string", pushState("doubleString")),
    number,
    dot,
    on(letter, ...name, classify(words, [paint("variable")], { caseless: true })),
    token(oneOf("()[]"), "punctuation.bracket"),
    token(oneOf(",;:"), "punctuation.delimiter"),
    token("&", "punctuation.special"),
    on("+-*/=<>&%", run("+-*/=<>&%"), paint("operator")),
  ];
  const lineRules = extension.lineRules?.(code) ?? {
    initial: "bol",
    states: {
      bol: {
        style: "plain" as const,
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          token("#", "keyword", setState("directive")),
        ],
        otherwise: [setState("root")],
      },
      root: { style: "plain" as const, arms: [token("\n", "plain", setState("bol")), ...code] },
      directive: {
        style: "keyword" as const,
        arms: [
          on("\\", literal("\\"), literal("\n"), paint("keyword")),
          token("\n", "plain", setState("bol")),
        ],
      },
    },
  };
  return defineGrammar({
    name: extension.name,
    aliases: extension.aliases,
    initial: lineRules.initial,
    states: {
      comment: { style: "comment", arms: [redispatch("\r\n", popState())] },
      singleString: {
        style: "string",
        arms: [
          on(
            "&",
            literal("&"),
            lookahead(
              bytes(" \t", { min: 0 }),
              optional(literal("!"), bytes(nonNewline, { min: 0 })),
              byte("\r\n"),
            ),
            paint("punctuation.special"),
            pushState("stringContinuation"),
          ),
          token("''", "string.escape"),
          token("'", "string", popState()),
        ],
      },
      doubleString: {
        style: "string",
        arms: [
          on(
            "&",
            literal("&"),
            lookahead(
              bytes(" \t", { min: 0 }),
              optional(literal("!"), bytes(nonNewline, { min: 0 })),
              byte("\r\n"),
            ),
            paint("punctuation.special"),
            pushState("stringContinuation"),
          ),
          token('""', "string.escape"),
          token('"', "string", popState()),
        ],
      },
      stringContinuation: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          token("!", "comment", pushState("comment")),
          token("&", "punctuation.special", popState()),
        ],
        otherwise: [popState()],
      },
      ...lineRules.states,
    } as Record<string, State>,
  });
}

export default fortran();
