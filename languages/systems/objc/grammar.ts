import {
  byte,
  bytes,
  choice,
  classify,
  keywordTable,
  lineStart,
  literal,
  lookahead,
  notNext,
  on,
  optional,
  paint,
  popState,
  pushState,
  setState,
  token,
} from "#/grammar/mod.ts";
import { c, type CExtension } from "#/languages/systems/c/grammar.ts";

const objcExtension: CExtension = ({ upper, start, rest, ident, comments }) => {
  const objcSelector = on(
    start,
    ...ident,
    lookahead(bytes(" \t\r\n", { min: 0 }), literal(":"), notNext(":")),
    paint("function"),
  );
  const objcMethodLead = on(
    "+-",
    lineStart(),
    byte("+-"),
    lookahead(bytes(" \t", { min: 0 }), literal("(")),
    paint("operator"),
    pushState("objcMethod"),
  );
  const whitespace = on(" \t\r\n", bytes(" \t\r\n"), paint("plain"));
  const methodEnd = [
    token(";", "punctuation.delimiter", popState(), pushState("labelCandidate")),
    token("{", "punctuation.bracket", popState(), pushState("labelCandidate")),
  ];
  return {
    name: "objc",
    aliases: ["objective-c", "objectivec"],
    keywords: (keywords) => {
      keywords.push(
        ...`
          __weak __strong __block __autoreleasing __unsafe_unretained __kindof __bridge
          __bridge_retained __bridge_transfer nullable nonnull null_unspecified _Nullable
          _Nonnull _Null_unspecified _Nullable_result __nullable __nonnull __covariant
          __contravariant
        `
          .trim()
          .split(/\s+/),
      );
    },
    types: (types) => {
      types.push(...["id", "instancetype", "SEL", "IMP", "BOOL", "Class"]);
    },
    beforeStrings: [
      token('@"', "string", pushState("string")),
      on(
        "@",
        literal("@"),
        ...ident,
        classify(
          [
            ...keywordTable(
              `
                @interface @implementation @protocol @end @synthesize @dynamic @class @encode
                @try @catch @finally @throw @autoreleasepool @available @import @optional
                @required @synchronized @defs @compatibility_alias
              `
                .trim()
                .split(/\s+/),
              "keyword",
            ),
            ...keywordTable(["@YES", "@NO"], "constant.builtin"),
            { text: "@property", then: [paint("keyword"), pushState("objcPropertyHead")] },
            { text: "@selector", then: [paint("keyword"), pushState("objcSelectorHead")] },
          ],
          [paint("keyword")],
        ),
      ),
      on(
        "@",
        literal("@"),
        lookahead(literal("[")),
        paint("punctuation.special"),
        pushState("objcArrayOpen"),
      ),
      token("@", "punctuation.special"),
      on(
        "BISCNnY",
        choice(...["BOOL", "IMP", "SEL", "Class"].map((word) => [literal(word)])),
        notNext(rest),
        paint("type"),
      ),
      on(
        "nNY",
        choice(...["nil", "Nil", "YES", "NO"].map((word) => [literal(word)])),
        notNext(rest),
        paint("constant.builtin"),
      ),
    ],
    identifierFallbacks: [on(upper, ...ident, paint("type"))],
    beforeBraces: [token("[", "punctuation.bracket", pushState("objcReceiver"))],
    rootBeforeCode: [objcMethodLead],
    indentBeforeLabels: [
      on(
        "+-",
        byte("+-"),
        lookahead(bytes(" \t", { min: 0 }), literal("(")),
        paint("operator"),
        popState(),
        pushState("objcMethod"),
      ),
    ],
    directiveCases: [{ text: "import", then: [paint("keyword"), setState("include")] }],
    states: (code) => ({
      objcReceiver: {
        style: "plain" as const,
        arms: [
          whitespace,
          ...comments,
          token(
            "[",
            "punctuation.bracket",
            setState("objcAfterReceiver"),
            pushState("objcReceiver"),
          ),
          token('@"', "string", setState("objcAfterReceiver"), pushState("string")),
          on(
            start,
            ...ident,
            lookahead(bytes(" \t", { min: 0 }), literal("(")),
            paint("function"),
            setState("objcAfterReceiver"),
          ),
          on(upper, ...ident, paint("type"), setState("objcAfterReceiver")),
          on(start, ...ident, paint("variable"), setState("objcAfterReceiver")),
          token("]", "punctuation.bracket", popState()),
        ],
        otherwise: [setState("objcBracketExpr")],
      },
      objcAfterReceiver: {
        style: "plain" as const,
        arms: [
          whitespace,
          ...comments,
          token("->", "operator", setState("objcReceiverMember")),
          token(".", "operator", setState("objcReceiverMember")),
          token("(", "punctuation.bracket", pushState("objcReceiverParen")),
          token("]", "punctuation.bracket", popState()),
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), literal(":")),
            paint("function"),
            setState("objcArguments"),
          ),
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), literal("]")),
            paint("function"),
            setState("objcArguments"),
          ),
        ],
        otherwise: [setState("objcBracketExpr")],
      },
      objcReceiverMember: {
        style: "plain" as const,
        arms: [
          whitespace,
          on(start, ...ident, paint("variable.member"), setState("objcAfterReceiver")),
        ],
        otherwise: [setState("objcBracketExpr")],
      },
      objcReceiverParen: {
        style: "plain" as const,
        arms: [
          token(")", "punctuation.bracket", popState()),
          token("(", "punctuation.bracket", pushState("objcReceiverParen")),
          ...code,
        ],
      },
      objcArguments: {
        style: "plain" as const,
        arms: [token("]", "punctuation.bracket", popState()), objcSelector, ...code],
      },
      objcBracketExpr: {
        style: "plain" as const,
        arms: [token("]", "punctuation.bracket", popState()), ...code],
      },
      objcArrayOpen: {
        style: "plain" as const,
        arms: [token("[", "punctuation.bracket", setState("objcArray"))],
      },
      objcArray: {
        style: "plain" as const,
        arms: [token("]", "punctuation.bracket", popState()), ...code],
      },
      objcSelectorHead: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("(", "punctuation.bracket", setState("objcSelector")),
        ],
        otherwise: [popState()],
      },
      objcSelector: {
        style: "plain" as const,
        arms: [
          token(")", "punctuation.bracket", popState()),
          on(start, ...ident, paint("function")),
          token(":", "operator"),
        ],
      },
      objcPropertyHead: {
        style: "plain" as const,
        arms: [
          on(" \t", bytes(" \t"), paint("plain")),
          token("(", "punctuation.bracket", setState("objcProperty")),
        ],
        otherwise: [popState()],
      },
      objcProperty: {
        style: "plain" as const,
        arms: [
          token(")", "punctuation.bracket", popState()),
          on(
            start,
            ...ident,
            classify(
              keywordTable(
                `
                  atomic nonatomic strong weak copy retain assign readonly readwrite getter
                  setter class nullable nonnull null_resettable
                `
                  .trim()
                  .split(/\s+/),
                "keyword",
              ),
              [paint("variable")],
            ),
          ),
          token(",", "punctuation.delimiter"),
          token("=", "operator"),
        ],
      },
      objcMethod: {
        style: "plain" as const,
        arms: [
          ...methodEnd,
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), literal(":")),
            paint("function"),
            setState("objcMethodArgs"),
          ),
          on(
            start,
            ...ident,
            lookahead(bytes(" \t\r\n", { min: 0 }), byte(";{")),
            paint("function"),
            setState("objcMethodArgs"),
          ),
          ...code,
        ],
      },
      objcMethodArgs: {
        style: "plain" as const,
        arms: [...methodEnd, objcSelector, ...code],
      },
    }),
  };
};

export default {
  ...c(objcExtension),
  extensions: ["m", "mm"],
};
