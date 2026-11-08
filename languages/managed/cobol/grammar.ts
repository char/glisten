import {
  byte,
  bytes,
  byteSet,
  classify,
  columnAtLeast,
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
  redispatch,
  setState,
  token,
  union,
  range,
  type State,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const line = except(all, "\r\n");
const digit = range("0", "9");
const letter = union(range("a", "z"), range("A", "Z"));
const name = union(letter, digit, "-_");
const keywords = `
  accept access add address advancing after all alphabet alphabetic alphabetic-lower
  alphabetic-upper alphanumeric also alternate and are area areas ascending assign at author
  before binary block by call cancel cd cf ch character characters class close cobol code
  code-set collating column comma common communication compute configuration contains content
  continue control controls copy corr corresponding count currency data date date-compiled
  date-written day day-of-week de debug debugging decimal-point declaratives delete delimited
  delimiter depending descending destination detail disable display divide division down
  duplicates dynamic else end end-accept end-add end-call end-compute end-delete end-display
  end-divide end-evaluate end-if end-multiply end-perform end-read end-return end-rewrite
  end-search end-start end-string end-subtract end-unstring end-write entry environment eop
  equal error evaluate every exception exit extend external false fd file file-control filler
  final first for from function generate giving global goback greater group heading high-value
  high-values i-o identification if in index indexed initialize input input-output inspect
  into invalid is justification justified key label last leading left length less linage line
  lines link linkage local-storage lock memory merge mode module modules more move multiple
  multiply native negative next no not null nulls number numeric object-computer occurs of off
  omitted on open optional or order organization other output overflow perform plus pointer
  position positive printing procedure procedures program program-id quote quotes random read
  record records recursive redef redefines reel reference references relative release
  remainder removal renames replacing report reporting reports rerun reserve reset return
  returning reverse rewinding rewrite right rounded run same sd search section security select
  sentence sequential set sign size sort sort-merge source source-computer special-names
  standard standard-1 standard-2 start status stop string subtract sum suppress symbolic sync
  synchronized table tallying tape terminal test than then through thru time times to top
  trailing true type unit until unstring up upon usage use using value values varying when
  with words working-storage write zero zeroes zeros space spaces low-value low-values
`
  .trim()
  .split(/\s+/);
const constants = `
    zero zeroes zeros space spaces high-value high-values low-value low-values quote quotes
    null nulls true false
  `
  .trim()
  .split(/\s+/);
const words = keywordTable(
  [
    ...keywords.filter((word) => !constants.includes(word) && word !== "function"),
    "go",
    "chaining",
  ],
  "keyword",
);
const values = keywordTable(constants, "constant.builtin");
const bounded = (set: Parameters<typeof bytes>[0], fixed: boolean, min = 1, max?: number) =>
  bytes(set, { min, ...(max === undefined ? {} : { max }), ...(fixed ? { untilColumn: 72 } : {}) });
// Whitespace needs no column bound: a byte at or past column 72 is plain anyway, so
// stopping the run there only splits a span that coalescing rejoins.
const spaces = (max?: number) => bytes(" \t", { min: 1, ...(max === undefined ? {} : { max }) });
const phrase = (text: string) =>
  [...text].map((c) => (/[a-z]/.test(c) ? byte(c + c.toUpperCase()) : literal(c)));
const fixedLimit = redispatch(line, columnAtLeast(72), setState("fixedIgnored"));
const newline = (state: string) => [token("\r", "plain"), token("\n", "plain", setState(state))];
const fixedDirective = (text: string, target: string) =>
  on(
    ">",
    lookahead(...phrase(text), notNext(name)),
    bounded(line, true, text.length, text.length),
    paint("keyword"),
    setState(target),
  );
const freeDirective = (text: string, target: string) =>
  on(">", ...phrase(text), notNext(name), paint("keyword"), setState(target));
const wordCases = (picture: string, functionState: string) => [
  { text: "function", then: [paint("keyword" as const), setState(functionState)] },
  ...["pic", "picture"].map((text) => ({
    text,
    then: [paint("keyword" as const), setState(picture)],
  })),
  ...words,
  ...values,
];
type CodeArea = "fixedAreaA" | "fixedCode" | "freeCode";

function code(area: CodeArea) {
  const fixed = area !== "freeCode";
  const areaA = area === "fixedAreaA";
  const next = fixed ? "fixedSequence" : "freeCode";
  const picture = fixed ? "fixedPicture" : "freePicture";
  const functionState = fixed ? "fixedFunction" : "freeFunction";
  const stringState = fixed ? "fixed" : "free";
  return [
    ...(fixed ? [fixedLimit] : []),
    ...(fixed && areaA ? [redispatch(line, columnAtLeast(11), setState("fixedCode"))] : []),
    ...newline(next),
    ...(fixed
      ? [
          fixedDirective(">>source format is free", "freeCode"),
          fixedDirective(">>source format free", "freeCode"),
        ]
      : [
          freeDirective(">>source format is fixed", "freeToFixed"),
          freeDirective(">>source format fixed", "freeToFixed"),
        ]),
    ...(fixed
      ? [
          on(
            "*",
            lookahead(literal("*>")),
            bounded(line, true, 2),
            paint("comment"),
            setState("fixedIgnored"),
          ),
        ]
      : [token("*>", "comment", setState("freeComment"))]),
    on(" \t", spaces(areaA ? 4 : undefined), paint("plain")),
    token('"', "string", setState(`${stringState}Double`)),
    token("'", "string", setState(`${stringState}Single`)),
    ...(fixed && areaA
      ? [
          on(
            letter,
            lookahead(bounded(name, true), bounded(".", true, 1, 1)),
            bounded(name, true),
            classify(wordCases(picture, functionState), [paint("label")], { caseless: true }),
          ),
        ]
      : []),
    on(
      letter,
      bounded(name, fixed),
      classify(wordCases(picture, functionState), [paint("variable")], { caseless: true }),
    ),
    on(
      digit,
      bounded(digit, fixed),
      optional(bounded(".", fixed, 1, 1), bounded(digit, fixed)),
      paint("number"),
      ...(fixed && areaA ? [setState("fixedCode")] : []),
    ),
    token(oneOf("()+-*/=<>:"), "operator"),
    token(oneOf(".,;"), "punctuation.delimiter"),
  ];
}
function quoted(quote: string, fixed: boolean) {
  return {
    style: "string" as const,
    arms: [
      ...(fixed ? [fixedLimit] : []),
      ...newline(fixed ? "fixedSequence" : "freeCode"),
      on(quote, bounded(quote, fixed, 2, 2), paint("string.escape")),
      token(quote, "string", setState(fixed ? "fixedCode" : "freeCode")),
      on(except(line, quote), bounded(except(line, quote), fixed), paint("string")),
    ],
  };
}
export default defineGrammar({
  name: "cobol",
  extensions: ["cob", "cbl", "cpy"],
  initial: "fixedSequence",
  tabStop: 8,
  states: {
    fixedSequence: {
      style: "comment",
      arms: [
        ...newline("fixedSequence"),
        on(line, bytes(line, { untilColumn: 6 }), paint("comment"), setState("fixedIndicator")),
      ],
    },
    fixedIndicator: {
      style: "plain",
      arms: [
        ...newline("fixedSequence"),
        token(oneOf("*/"), "comment", setState("fixedComment")),
        token(oneOf("-Dd"), "punctuation.special", setState("fixedAreaA")),
        on(line, byte(line), paint("plain"), setState("fixedAreaA")),
      ],
    },
    fixedAreaA: { style: "plain", arms: code("fixedAreaA") },
    fixedCode: { style: "plain", arms: code("fixedCode") },
    freeCode: { style: "plain", arms: code("freeCode") },
    fixedFunction: {
      style: "plain",
      arms: [
        fixedLimit,
        ...newline("fixedSequence"),
        on(" \t", spaces(), paint("plain")),
        on(letter, bounded(name, true), paint("function"), setState("fixedCode")),
      ],
    },
    freeFunction: {
      style: "plain",
      arms: [
        ...newline("freeCode"),
        on(" \t", bytes(" \t"), paint("plain")),
        on(letter, bytes(name), paint("function"), setState("freeCode")),
      ],
    },
    fixedPicture: {
      style: "plain",
      arms: [
        fixedLimit,
        ...newline("fixedSequence"),
        on(" \t", spaces(), paint("plain")),
        on(
          "iI",
          bounded("iI", true, 1, 1),
          bounded("sS", true, 1, 1),
          notNext(name),
          paint("keyword"),
        ),
        on(line, bounded(except(line, " \t"), true), paint("type"), setState("fixedCode")),
      ],
    },
    freePicture: {
      style: "plain",
      arms: [
        ...newline("freeCode"),
        on(" \t", bytes(" \t"), paint("plain")),
        on("iI", byte("iI"), byte("sS"), notNext(name), paint("keyword")),
        on(line, bytes(except(line, " \t")), paint("type"), setState("freeCode")),
      ],
    },
    fixedDouble: quoted('"', true),
    fixedSingle: quoted("'", true),
    freeDouble: quoted('"', false),
    freeSingle: quoted("'", false),
    fixedIgnored: { style: "plain", arms: newline("fixedSequence") },
    fixedComment: {
      style: "comment",
      arms: [
        fixedLimit,
        ...newline("fixedSequence"),
        on(line, bounded(line, true), paint("comment")),
      ],
    },
    freeComment: { style: "comment", arms: [token("\n", "plain", setState("freeCode"))] },
    freeToFixed: { style: "plain", arms: newline("fixedSequence") },
  } satisfies Record<string, State>,
});
