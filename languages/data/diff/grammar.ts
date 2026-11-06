import {
  byte,
  bytes,
  byteSet,
  defineGrammar,
  except,
  lineEnd,
  literal,
  lookahead,
  on,
  optional,
  paint,
  range,
  setState,
  token,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const line = except(all, "\r\n");
const digit = range("0", "9");
const rangeNumber = [bytes(digit), optional(literal(","), bytes(digit))];
const heading = on(
  "@",
  literal("@@ -"),
  ...rangeNumber,
  literal(" +"),
  ...rangeNumber,
  literal(" @@"),
  paint("punctuation.special"),
  setState("section"),
);
const contextRange = (marker: "***" | "---", end: "****" | "----") =>
  on(
    marker[0]!,
    literal(marker + " "),
    ...rangeNumber,
    literal(" " + end),
    optional(literal("\r")),
    lineEnd(),
    paint("punctuation.special"),
    setState(marker === "***" ? "contextOld" : "contextNew"),
  );
const metadata = [
  ...[
    "diff ",
    "Index: ",
    "index ",
    "old mode ",
    "new mode ",
    "new file mode ",
    "deleted file mode ",
    "similarity index ",
    "dissimilarity index ",
    "rename from ",
    "rename to ",
    "copy from ",
    "copy to ",
    "Binary files ",
    "GIT binary patch",
    "literal ",
    "delta ",
  ].map((prefix) =>
    on(
      prefix[0]!,
      literal(prefix),
      bytes(line, { min: 0 }),
      paint("text.title"),
      setState("headerTail"),
    ),
  ),
  on(
    "*",
    literal("***************"),
    optional(literal("\r")),
    lineEnd(),
    paint("punctuation.special"),
    setState("contextOld"),
  ),
];
const fileHeader = (prefix: string) =>
  on(
    prefix[0]!,
    literal(prefix),
    bytes(line, { min: 0 }),
    paint("text.title"),
    setState("headerTail"),
  );
const mail = [
  "From ",
  "From: ",
  "Date: ",
  "Subject: ",
  "To: ",
  "Cc: ",
  "Message-ID: ",
  "MIME-Version: ",
  "Content-Type: ",
  "Content-Transfer-Encoding: ",
].map((prefix) =>
  on(
    prefix[0]!,
    literal(prefix),
    bytes(line, { min: 0 }),
    paint("text.title"),
    setState("headerTail"),
  ),
);

export default defineGrammar({
  name: "diff",
  aliases: ["patch"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        heading,
        contextRange("***", "****"),
        contextRange("---", "----"),
        ...metadata,
        fileHeader("--- "),
        fileHeader("+++ "),
        fileHeader("*** "),
        ...mail,
        token("\n", "plain"),
        on(all, byte(all), paint("plain"), setState("plainLine")),
      ],
    },
    unified: {
      style: "plain",
      arms: [
        heading,
        ...metadata,
        // Hunk lengths cannot be counted here, so consecutive `--- ` and `+++ `
        // lines are treated as file headers. This misclassifies a removed line
        // starting `-- ` immediately followed by an added line starting `++ `.
        on(
          "-",
          literal("--- "),
          bytes(line, { min: 0 }),
          optional(literal("\r")),
          literal("\n"),
          lookahead(literal("+++ ")),
          paint("text.title"),
          setState("root"),
        ),
        token("+", "diff.plus", setState("plus")),
        token("-", "diff.minus", setState("minus")),
        token("\\ No newline at end of file", "comment", setState("unifiedTail")),
        token("\n", "plain"),
        on(all, byte(all), paint("plain"), setState("unifiedTail")),
      ],
    },
    contextOld: {
      style: "plain",
      arms: [
        contextRange("***", "****"),
        contextRange("---", "----"),
        ...metadata,
        token("- ", "diff.minus", setState("contextOldMinus")),
        token("! ", "diff.minus", setState("contextOldMinus")),
        token("\\ No newline at end of file", "comment", setState("contextOldTail")),
        token("\n", "plain"),
        on(all, byte(all), paint("plain"), setState("contextOldTail")),
      ],
    },
    contextNew: {
      style: "plain",
      arms: [
        contextRange("***", "****"),
        contextRange("---", "----"),
        ...metadata,
        token("+ ", "diff.plus", setState("contextNewPlus")),
        token("! ", "diff.plus", setState("contextNewPlus")),
        token("\\ No newline at end of file", "comment", setState("contextNewTail")),
        token("\n", "plain"),
        on(all, byte(all), paint("plain"), setState("contextNewTail")),
      ],
    },
    section: { style: "label", arms: [token("\n", "plain", setState("unified"))] },
    plus: { style: "diff.plus", arms: [token("\n", "plain", setState("unified"))] },
    minus: { style: "diff.minus", arms: [token("\n", "plain", setState("unified"))] },
    contextNewPlus: { style: "diff.plus", arms: [token("\n", "plain", setState("contextNew"))] },
    contextOldMinus: { style: "diff.minus", arms: [token("\n", "plain", setState("contextOld"))] },
    contextOldTail: { style: "plain", arms: [token("\n", "plain", setState("contextOld"))] },
    contextNewTail: { style: "plain", arms: [token("\n", "plain", setState("contextNew"))] },
    unifiedTail: { style: "plain", arms: [token("\n", "plain", setState("unified"))] },
    headerTail: { style: "plain", arms: [token("\n", "plain", setState("root"))] },
    plainLine: { style: "plain", arms: [token("\n", "plain", setState("root"))] },
  },
});
