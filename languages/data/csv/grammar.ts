import {
  byte,
  bytes,
  byteSet,
  choice,
  defineGrammar,
  except,
  literal,
  notNext,
  on,
  optional,
  paint,
  range,
  setState,
  token,
} from "#/grammar/mod.ts";

export function delimited(name: string, separator: "," | "\t", quoted: boolean) {
  const digit = range("0", "9");
  const field = except(byteSet({ ranges: [[0, 255]] }), `${separator}\r\n`);
  const number = on(
    "+-.0123456789",
    optional(byte("+-")),
    choice(
      [bytes(digit), optional(literal("."), bytes(digit, { min: 0 }))],
      [literal("."), bytes(digit)],
    ),
    optional(byte("eE"), optional(byte("+-")), bytes(digit)),
    notNext(field),
    paint("number"),
    setState("field"),
  );
  const separators = [
    token(separator, "punctuation.delimiter", setState("root")),
    token("\n", "plain", setState("root")),
    token("\r", "plain", setState("root")),
  ];
  return defineGrammar({
    name,
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          ...separators,
          ...(quoted ? [token('"', "string", setState("quoted"))] : []),
          number,
        ],
        otherwise: [setState("field")],
      },
      field: { style: "plain", arms: separators },
      quoted: {
        style: "string",
        arms: [token('""', "string.escape"), token('"', "string", setState("field"))],
      },
    },
  });
}

export default {
  ...delimited("csv", ",", true),
  extensions: ["csv"],
};
