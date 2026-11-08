import {
  byte,
  bytes,
  choice,
  classify,
  keywordTable,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  range,
  setState,
  union,
  type State,
} from "#/grammar/mod.ts";
import { basicKeywords, type VbExtension } from "./grammar.ts";

export function classic(name: "vba" | "vbscript"): VbExtension {
  return ({ digit, start, rest, ident }) => {
    const script = name === "vbscript";
    const excludedKeywords = script
      ? `as enum friend global gosub goto type variant withevents static`.trim().split(/\s+/)
      : ["class", "variant"];
    const words = basicKeywords.filter((word) => !excludedKeywords.includes(word));
    const hex = union(digit, range("a", "f"), range("A", "F"));
    const suffix = "$%&!#@";
    const label = on(start, ...ident, lookahead(literal(":")), paint("label"));
    return {
      name,
      aliases: script ? [] : ["vb6"],
      classic: true,
      keywords: [
        ...words,
        ...(script
          ? ["execute", "executeglobal", "eval"]
          : `
            base compare declare defbool defbyte defcur defdate defdbl defint deflng defobj defsng
            defstr defvar implements input line lock lset ptrsafe raiseevent rset seek shared unlock
          `
              .trim()
              .split(/\s+/)),
      ],
      types: script
        ? []
        : `
          boolean byte currency date decimal double integer long longlong longptr object single
          string variant
        `
            .trim()
            .split(/\s+/),
      builtins: script ? ["wscript", "empty", "null"] : ["empty", "null"],
      declarationWords: ["sub", "function", "property"],
      directives: `const if elseif else end`.trim().split(/\s+/),
      number: on(
        "&0123456789",
        choice(
          [literal("&"), byte("hH"), bytes(hex)],
          [literal("&"), byte("oO"), bytes("01234567")],
          [
            bytes(digit),
            optional(literal("."), byte(digit), bytes(digit, { min: 0 })),
            optional(byte("eE"), optional(byte("+-")), bytes(digit)),
          ],
        ),
        ...(script ? [] : [optional(byte(suffix))]),
        paint("number"),
      ),
      beforeIdentifiers: script
        ? [
            on(
              "wW",
              ...[..."wscript"].map((c) => byte(c + c.toUpperCase())),
              lookahead(literal(".")),
              paint("constant.builtin"),
              setState("scriptMember"),
            ),
          ]
        : [
            on(
              start,
              ...ident,
              byte(suffix),
              notNext(rest),
              lookahead(bytes(" \t", { min: 0 }), literal("(")),
              paint("function"),
            ),
            on(start, ...ident, byte(suffix), notNext(rest), paint("variable")),
          ],
      statementLeading: [
        ...(script
          ? []
          : [
              on(
                "aA",
                ...[..."attribute"].map((c) => byte(c + c.toUpperCase())),
                notNext(rest),
                lookahead(byte(" \t")),
                paint("keyword"),
                setState("classicAttribute"),
              ),
            ]),
        on(digit, bytes(digit), lookahead(byte(" \t:")), paint("label")),
        label,
      ],
      declarationLeading: [
        ...(script
          ? []
          : [
              on(start, ...ident, byte(suffix), notNext(rest), paint("function"), setState("code")),
            ]),
        on(
          start,
          ...ident,
          classify(
            keywordTable(["get", "let", "set"], "keyword"),
            [paint("function"), setState("code")],
            { caseless: true },
          ),
        ),
      ],
      states: (script
        ? {
            scriptMember: {
              style: "plain",
              arms: [
                on(".", literal("."), paint("punctuation.delimiter")),
                on(
                  start,
                  ...ident,
                  classify(
                    keywordTable(
                      `
                        echo quit sleep createobject getobject connectobject disconnectobject
                      `
                        .trim()
                        .split(/\s+/),
                      "function",
                    ).map(({ text, then }) => ({ text, then: [...then, setState("code")] })),
                    [paint("variable.member"), setState("code")],
                    { caseless: true },
                  ),
                ),
              ],
              otherwise: [setState("code")],
            },
          }
        : {
            classicAttribute: {
              style: "plain",
              arms: [
                on(" \t", bytes(" \t"), paint("plain")),
                on(start, ...ident, paint("attribute"), setState("code")),
              ],
              otherwise: [setState("code")],
            },
          }) as Record<string, State>,
    };
  };
}
