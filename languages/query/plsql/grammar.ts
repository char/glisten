import {
  byte,
  bytes,
  byteSet,
  choice,
  character,
  classify,
  except,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  setState,
  shell,
  token,
} from "#/grammar/mod.ts";
import { sql, type SqlExtension } from "#/languages/query/sql/grammar.ts";

const plsql: SqlExtension = ({ start, rest, name }) => {
  const delimiter = except(byteSet({ ranges: [[33, 255]] }), "[{<('");
  return {
    name: "plsql",
    aliases: [],
    keywords: (words) =>
      words.push(
        ..."declare exception package body cursor loop raise pragma elsif exit bulk collect forall in out nocopy record subtype constant reverse return returning autonomous_transaction open close is begin end spool".split(
          " ",
        ),
      ),
    types: (words) =>
      words.push(
        ..."varchar2 nvarchar2 number pls_integer binary_integer simple_integer rowid urowid clob nclob bfile sys_refcursor".split(
          " ",
        ),
      ),
    createHeadCases: [
      { text: "package", then: [paint("keyword"), setState("plsqlPackageHead")] },
      { text: "type", then: [paint("keyword"), popState(), pushState("relation")] },
    ],
    beforeStrings: [
      on(
        "qQ",
        previousNotIn(rest),
        byte("qQ"),
        literal("'"),
        lookahead(byte(byteSet({ ranges: [[33, 255]] }))),
        paint("string"),
        pushState("plsqlQuoteOpen"),
      ),
    ],
    beforeVariables: [
      on("@ \t", lineStart(), bytes(" \t", { min: 0 }), literal("@"), paint("keyword")),
    ],
    beforeWords: [
      on(
        "/ \t",
        lineStart(),
        bytes(" \t", { min: 0 }),
        literal("/"),
        lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        paint("keyword"),
      ),
      on("<", literal("<<"), byte(start), bytes(rest, { min: 0 }), literal(">>"), paint("label")),
      on(
        "%",
        literal("%"),
        choice(
          [byte("tT"), byte("yY"), byte("pP"), byte("eE")],
          [byte("rR"), byte("oO"), byte("wW"), byte("tT"), byte("yY"), byte("pP"), byte("eE")],
        ),
        notNext(rest),
        paint("type"),
      ),
    ],
    states: () => ({
      plsqlPackageHead: {
        style: "plain",
        arms: [
          on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
          on(
            start,
            ...name,
            classify([{ text: "body", then: [paint("keyword")] }], [paint("type"), popState()], {
              caseless: true,
            }),
          ),
        ],
        otherwise: [popState()],
      },
      plsqlQuoteOpen: {
        style: "string",
        arms: [
          token("[", "string", setState("plsqlQuoteSquare")),
          token("{", "string", setState("plsqlQuoteBrace")),
          token("<", "string", setState("plsqlQuoteAngle")),
          token("(", "string", setState("plsqlQuoteRound")),
          on(
            delimiter,
            character(),
            paint("string"),
            shell.captureReset(),
            shell.captureAppend(),
            setState("plsqlQuoteSame"),
          ),
        ],
        otherwise: [popState()],
      },
      plsqlQuoteSquare: { style: "string", arms: [token("]'", "string", popState())] },
      plsqlQuoteBrace: { style: "string", arms: [token("}'", "string", popState())] },
      plsqlQuoteAngle: { style: "string", arms: [token(">'", "string", popState())] },
      plsqlQuoteRound: { style: "string", arms: [token(")'", "string", popState())] },
      plsqlQuoteSame: {
        style: "string",
        arms: [on(delimiter, shell.captured(), literal("'"), paint("string"), popState())],
      },
    }),
  };
};

export default sql(plsql);
