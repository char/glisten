import {
  type Arm,
  type Effect,
  type State,
  byte,
  byteSet,
  bytes,
  character,
  choice,
  classify,
  closeInjection,
  defineGrammar,
  except,
  hostPrefix,
  lineEnd,
  literal,
  lookahead,
  on,
  openInjection,
  optional,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  shell,
  token,
  union,
} from "#/grammar/mod.ts";
import type { Style } from "#/grammar/styles.ts";

const all = byteSet({ ranges: [[0, 255]] });
const alpha = union(range("a", "z"), range("A", "Z"), "_");
const name = union(alpha, range("0", "9"), "-");
const ident = [byte(alpha), bytes(name, { min: 0 })];
const hex = union(range("0", "9"), range("a", "f"), range("A", "F"));
const nonBlank = except(all, " \t\r\n");

type ExpressionContext = "embedded" | "standalone";

function expression(
  context: ExpressionContext,
  other: "variable" | "function" | "attribute" = "variable",
): Arm[] {
  const prefix = (): Effect[] => (context === "embedded" ? [hostPrefix()] : []);
  const suffix = context === "embedded" ? "Inner" : "Outer";
  const emit = (text: string, style: Style, ...effects: Effect[]) =>
    on(text[0]!, literal(text), ...prefix(), paint(style), ...effects);
  const nameCases = [
    ...["if", "else", "set", "shell", "export", "alias", "import", "mod"].map((text) => ({
      text,
      then: [...prefix(), paint("keyword")],
    })),
    ...["true", "false"].map((text) => ({ text, then: [...prefix(), paint("constant.builtin")] })),
  ];
  return [
    emit("x'''", "string", pushState(`rawTriple${suffix}`)),
    emit('x"""', "string", pushState(`cookedTriple${suffix}`)),
    emit("x'", "string", pushState(`raw${suffix}`)),
    emit('x"', "string", pushState(`cooked${suffix}`)),
    emit("'''", "string", pushState(`rawTriple${suffix}`)),
    emit('"""', "string", pushState(`cookedTriple${suffix}`)),
    emit("```", "string", pushState(`commandTriple${suffix}`)),
    emit("'", "string", pushState(`raw${suffix}`)),
    emit('"', "string", pushState(`cooked${suffix}`)),
    emit("`", "string", pushState(`command${suffix}`)),
    ...[":=", "==", "!=", "=~", "&&", "||", "++"].map((operator) => emit(operator, "operator")),
    ...["+", "-", "*", "/", "=", "?", "$", "@", ":"].map((operator) => emit(operator, "operator")),
    ...["(", ")", "[", "]", "{", "}"].map((bracket) => emit(bracket, "punctuation.bracket")),
    emit(",", "punctuation.delimiter"),
    on(
      alpha,
      ...ident,
      lookahead(optional(bytes(" \t")), literal("(")),
      ...prefix(),
      paint(other === "attribute" ? "attribute" : "function"),
    ),
    on(alpha, ...ident, classify(nameCases, [...prefix(), paint(other)])),
    on(" \t\r", bytes(" \t\r"), ...prefix(), paint("plain")),
    ...(context === "embedded" ? [on(all, character(), hostPrefix(), paint("plain"))] : []),
  ];
}

function strings(context: ExpressionContext): Record<string, State> {
  const suffix = context === "embedded" ? "Inner" : "Outer";
  const prefix = (): Effect[] => (context === "embedded" ? [hostPrefix()] : []);
  const close = (text: string) =>
    on(text[0]!, literal(text), ...prefix(), paint("string"), popState());
  const escaped = on(
    "\\",
    literal("\\"),
    choice(
      [byte('nrt"\\')],
      [literal("u{"), bytes(hex, { min: 1, max: 6 }), literal("}")],
      [literal("\r\n")],
      [literal("\n")],
    ),
    ...prefix(),
    paint("string.escape"),
  );
  const fallback =
    context === "embedded" ? [on(all, character(), hostPrefix(), paint("string"))] : [];
  return {
    [`raw${suffix}`]: { style: "string", arms: [close("'"), ...fallback] },
    [`cooked${suffix}`]: { style: "string", arms: [escaped, close('"'), ...fallback] },
    [`rawTriple${suffix}`]: { style: "string", arms: [close("'''"), ...fallback] },
    [`cookedTriple${suffix}`]: { style: "string", arms: [escaped, close('"""'), ...fallback] },
    [`command${suffix}`]: { style: "string", arms: [close("`"), ...fallback] },
    [`commandTriple${suffix}`]: { style: "string", arms: [close("```"), ...fallback] },
  };
}

const outer = expression("standalone");
const inner = expression("embedded");
const outerGroups = [
  token("(", "punctuation.bracket", pushState("outerParen")),
  token("[", "punctuation.bracket", pushState("outerBracket")),
  token("{", "punctuation.bracket", pushState("outerBrace")),
];
const innerGroups = [
  on("(", literal("("), hostPrefix(), paint("punctuation.bracket"), pushState("innerParen")),
  on("[", literal("["), hostPrefix(), paint("punctuation.bracket"), pushState("innerBracket")),
  on("{", literal("{"), hostPrefix(), paint("punctuation.bracket"), pushState("innerBrace")),
];
function group(close: string, context: ExpressionContext): State {
  return {
    style: "plain",
    arms: [
      on(
        close,
        literal(close),
        ...(context === "embedded" ? [hostPrefix()] : []),
        paint("punctuation.bracket"),
        popState(),
      ),
      ...(context === "embedded" ? innerGroups : outerGroups),
      ...(context === "embedded"
        ? []
        : [token("#", "comment", pushState("comment")), token("\n", "plain")]),
      ...(context === "embedded" ? inner : outer),
    ],
  };
}

// Just compares indentation bytes exactly. The capture holds up to 256 bytes;
// an overlong indent cannot be matched on later lines. Only exact supported
// shebangs override the Bash default; shell settings do not select a child.
export default defineGrammar({
  name: "just",
  extensions: ["just"],
  filenames: ["justfile", "Justfile", ".justfile"],
  aliases: ["justfile"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token("[", "punctuation.bracket", setState("attribute")),
        token("@", "operator"),
        on(
          alpha,
          ...ident,
          lookahead(optional(bytes(" \t")), literal(":=")),
          paint("variable"),
          setState("statement"),
        ),
        on(
          alpha,
          ...ident,
          lookahead(optional(bytes(" \t")), literal(":")),
          paint("function"),
          setState("header"),
        ),
        on(
          alpha,
          ...ident,
          classify(
            [
              { text: "set", then: [paint("keyword"), setState("settingName")] },
              ...["export", "alias", "import", "mod"].map((text) => ({
                text,
                then: [paint("keyword"), setState("statement")],
              })),
            ],
            [paint("function"), setState("header")],
          ),
        ),
        token("\n", "plain"),
      ],
    },
    settingName: {
      style: "plain",
      arms: [
        on(alpha, ...ident, paint("keyword"), setState("statement")),
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState("root")),
      ],
    },
    statement: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState("root")),
        ...outerGroups,
        ...outer,
      ],
    },
    attribute: {
      style: "plain",
      arms: [
        token("]", "punctuation.bracket", setState("root")),
        token("\n", "plain", setState("root")),
        ...expression("standalone", "attribute"),
      ],
    },
    header: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token(":=", "operator"),
        token(":", "operator", setState("dependencies")),
        token("\n", "plain", setState("root")),
        ...outerGroups,
        ...outer,
      ],
    },
    dependencies: {
      style: "plain",
      arms: [
        token("#", "comment", pushState("comment")),
        token("\n", "plain", setState("bodyPending")),
        token("(", "punctuation.bracket", pushState("dependencyName")),
        ...expression("standalone", "function"),
      ],
    },
    dependencyName: {
      style: "plain",
      arms: [on(alpha, ...ident, paint("function"), setState("outerParen"))],
    },
    outerParen: group(")", "standalone"),
    outerBracket: group("]", "standalone"),
    outerBrace: group("}", "standalone"),
    bodyPending: {
      style: "plain",
      arms: [
        ...(
          [
            ["#!/usr/bin/env python3", "python"],
            ["#!/usr/bin/python3", "python"],
            ["#!/usr/bin/env node", "javascript"],
            ["#!/usr/bin/node", "javascript"],
          ] as const
        ).map(([shebang, language]) =>
          on(
            " \t",
            bytes(" \t"),
            lookahead(literal(shebang), optional(literal("\r")), lineEnd()),
            shell.captureReset(),
            shell.captureAppend(),
            paint("plain"),
            openInjection({ static: language }),
            setState("bodyHead"),
          ),
        ),
        on(
          " \t",
          bytes(" \t"),
          lookahead(byte(nonBlank)),
          shell.captureReset(),
          shell.captureAppend(),
          paint("plain"),
          openInjection({ static: "bash" }),
          setState("bodyHead"),
        ),
        on(" \t", bytes(" \t"), lookahead(optional(literal("\r")), lineEnd()), paint("plain")),
        token("\r", "plain"),
        token("\n", "plain"),
      ],
      otherwise: [setState("root")],
    },
    bodyLine: {
      style: "plain",
      arms: [
        on(" \t", shell.captured(), hostPrefix(), paint("plain"), setState("bodyHead")),
        on(
          " \t",
          bytes(" \t"),
          lookahead(optional(literal("\r")), lineEnd()),
          hostPrefix(),
          paint("plain"),
        ),
        token("\r", "plain"),
        token("\n", "plain"),
        redispatch(all, closeInjection(), setState("root")),
      ],
    },
    bodyHead: {
      style: "plain",
      arms: [
        on(
          "@-",
          choice([literal("@-")], [literal("-@")], [literal("@")], [literal("-")]),
          hostPrefix(),
          paint("operator"),
          setState("body"),
        ),
      ],
      otherwise: [setState("body")],
    },
    body: {
      style: "plain",
      arms: [
        token("{{{{", "plain"),
        on(
          "{",
          literal("{{"),
          hostPrefix(),
          paint("punctuation.special"),
          pushState("interpolation"),
        ),
        token("\n", "plain", setState("bodyLine")),
      ],
    },
    interpolation: {
      style: "plain",
      arms: [
        on("}", literal("}}"), hostPrefix(), paint("punctuation.special"), popState()),
        ...innerGroups,
        ...inner,
      ],
    },
    innerParen: group(")", "embedded"),
    innerBracket: group("]", "embedded"),
    innerBrace: group("}", "embedded"),
    comment: { style: "comment", arms: [redispatch("\n", popState())] },
    ...strings("standalone"),
    ...strings("embedded"),
  },
});
