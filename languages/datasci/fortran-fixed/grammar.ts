import {
  byte,
  bytes,
  byteSet,
  columnAtLeast,
  except,
  lineStart,
  on,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  type Arm,
  type State,
} from "#/grammar/mod.ts";
import { fortran } from "#/languages/datasci/fortran/grammar.ts";

const all = byteSet({ ranges: [[0, 255]] });
const nonNewline = except(all, "\r\n");
const digit = range("0", "9");
const fullComment = on(
  "cC*",
  lineStart(),
  byte("cC*"),
  paint("comment"),
  pushState("fixedFullComment"),
);
const tail = on(nonNewline, columnAtLeast(72), bytes(nonNewline), paint("plain"));
const newline = token("\n", "plain", setState("fixedLine"));
const headerPrefix = [
  fullComment,
  on(" \t", bytes(" \t", { untilColumn: 5 }), paint("plain")),
  on(digit, bytes(digit, { untilColumn: 5 }), paint("label")),
  on(nonNewline, bytes(nonNewline, { untilColumn: 5 }), paint("plain")),
];

function stringHeader(state: string): State {
  return {
    style: "plain",
    arms: [
      token("\n", "plain"),
      on(" 0\t", columnAtLeast(5), byte(" 0\t"), paint("plain"), popState()),
      on(
        nonNewline,
        columnAtLeast(5),
        byte(nonNewline),
        paint("punctuation.special"),
        setState(state),
      ),
      ...headerPrefix,
    ],
  };
}

function stringState(quote: string, header: string): State {
  return {
    style: "string",
    arms: [
      tail,
      on(quote, bytes(quote, { min: 2, max: 2, untilColumn: 72 }), paint("string.escape")),
      token(quote, "string", popState()),
      on(
        except(nonNewline, quote),
        bytes(except(nonNewline, quote), { untilColumn: 72 }),
        paint("string"),
      ),
      token("\n", "plain", setState(header)),
    ],
  };
}

export default {
  ...fortran({
    name: "fortran-fixed",
    columnLimit: 72,
    lineRules: (code: readonly Arm[]) => ({
      initial: "fixedLine",
      states: {
        fixedLine: {
          style: "plain",
          arms: [
            token("\n", "plain"),
            on(" 0\t", columnAtLeast(5), byte(" 0\t"), paint("plain"), setState("fixedCode")),
            on(
              nonNewline,
              columnAtLeast(5),
              byte(nonNewline),
              paint("punctuation.special"),
              setState("fixedCode"),
            ),
            ...headerPrefix,
          ],
        },
        fixedCode: { style: "plain", arms: [newline, tail, ...code] },
        fixedFullComment: {
          style: "comment",
          arms: [
            tail,
            on(nonNewline, bytes(nonNewline, { untilColumn: 72 }), paint("comment")),
            redispatch("\r\n", popState()),
          ],
        },
        comment: {
          style: "comment",
          arms: [
            on(nonNewline, columnAtLeast(72), bytes(nonNewline), paint("plain"), popState()),
            on(nonNewline, bytes(nonNewline, { untilColumn: 72 }), paint("comment")),
            redispatch("\r\n", popState()),
          ],
        },
        singleString: stringState("'", "fixedSingleHeader"),
        doubleString: stringState('"', "fixedDoubleHeader"),
        fixedSingleHeader: stringHeader("singleString"),
        fixedDoubleHeader: stringHeader("doubleString"),
      },
    }),
  }),
  extensions: ["f", "for", "f77", "ftn"],
};
