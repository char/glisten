import {
  byte,
  bytes,
  choice,
  lineEnd,
  lineStart,
  literal,
  lookahead,
  on,
  optional,
  paint,
  popState,
  previousNotIn,
  pushState,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";
import { sql, type SqlExtension } from "#/languages/query/sql/grammar.ts";

const tsql: SqlExtension = ({ start, rest, hex }) => {
  const variableRest = union(rest, "#@");
  const temp = [choice([literal("##")], [literal("#")]), byte(start), bytes(rest, { min: 0 })];
  return {
    name: "tsql",
    aliases: [],
    keywords: (words) =>
      words.push(
        ...`
          declare try catch while break continue matched exec output top merge print raiserror throw
          use proc with nolock identity pivot unpivot apply over partition row_number offset fetch
          next rows only transaction tran save trigger inserted deleted
        `
          .trim()
          .split(/\s+/),
      ),
    types: (words) =>
      words.push(
        ..."nvarchar ntext varchar datetime datetime2 datetimeoffset smalldatetime money smallmoney uniqueidentifier sql_variant sysname hierarchyid geography geometry image tinyint bigint varbinary"
          .split(" ")
          .filter((word) => !words.includes(word)),
      ),
    operators: [
      "<=",
      ">=",
      "<>",
      "!=",
      "!<",
      "!>",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "&=",
      "^=",
      "|=",
      "<<",
      ">>",
    ],
    createHeadCases: [
      { text: "alter", then: [paint("keyword")] },
      { text: "proc", then: [paint("keyword"), popState(), pushState("relation")] },
    ],
    beforeStrings: [
      on("nN", previousNotIn(rest), byte("nN"), literal("'"), paint("string"), pushState("string")),
      token("[", "variable", pushState("tsqlBracket")),
    ],
    beforeVariables: [
      on(
        "@",
        literal("@"),
        bytes("@", { min: 0, max: 1 }),
        byte(start),
        bytes(variableRest, { min: 0 }),
        paint("variable"),
      ),
    ],
    beforeNumbers: [on("0", literal("0"), byte("xX"), bytes(hex, { min: 0 }), paint("number"))],
    beforeWords: [
      on(
        " \t",
        lineStart(),
        bytes(" \t"),
        lookahead(
          byte("gG"),
          byte("oO"),
          bytes(" \t", { min: 0 }),
          optional(literal("\r")),
          lineEnd(),
        ),
        paint("plain"),
        pushState("tsqlBatch"),
      ),
      on(
        "gG",
        lineStart(),
        byte("gG"),
        byte("oO"),
        lookahead(bytes(" \t", { min: 0 }), optional(literal("\r")), lineEnd()),
        paint("keyword"),
      ),
      on("#", ...temp, paint("variable")),
    ],
    relationLeading: [
      token("[", "variable", pushState("tsqlRelationBracket")),
      on("#", ...temp, paint("variable"), popState()),
    ],
    states: () => ({
      tsqlBatch: {
        style: "plain",
        arms: [on("gG", byte("gG"), byte("oO"), paint("keyword"), popState())],
        otherwise: [popState()],
      },
      tsqlBracket: {
        style: "variable",
        arms: [token("]]", "variable"), token("]", "variable", popState())],
      },
      tsqlRelationBracket: {
        style: "variable",
        arms: [
          token("]]", "variable"),
          token("]", "variable", popState(), setState("relationAfterQuoted")),
        ],
      },
    }),
  };
};

export default sql(tsql);
