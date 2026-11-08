import {
  type Arm,
  type State,
  byte,
  bytes,
  cachedPrefix,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  markRecord,
  notNext,
  on,
  oneOf,
  optional,
  paint,
  patchRecord,
  popState,
  pushState,
  range,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";
import { shellBindings, shellFunctions, withShell } from "./shell.ts";

const digit = range("0", "9");
const start = union("_", range("a", "z"), range("A", "Z"));
const rest = union("_'-", range("a", "z"), range("A", "Z"), range("0", "9"));
const alpha = union(range("a", "z"), range("A", "Z"));
const uriScheme = union("+-.", range("a", "z"), range("A", "Z"), range("0", "9"));
const pathPart = union("._+-", range("a", "z"), range("A", "Z"), range("0", "9"));
const uriPart = union("%/?:@&=+$,-_.!~*'", range("a", "z"), range("A", "Z"), range("0", "9"));

const delimiter = paint("punctuation.delimiter");
const string = paint("string");
const pathTail = choice([bytes(pathPart)], [lookahead(literal("${"))]);

const trivia = [
  on(" \t\r\n", bytes(" \t\r\n"), paint("plain")),
  token("#", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
];
const identifier = [byte(start), bytes(rest, { min: 0 })];
const member = paint("variable.member");
const builtin = paint("constant.builtin");
const keyword = paint("keyword");
const keywords = ["if", "then", "else", "in", "rec", "or"];
const constants = ["true", "false", "null"];
const expressionWords = (context: "expression" | "let") =>
  classify(
    [
      ...keywordTable(keywords, "keyword", (text) =>
        text === "in" && context === "let" ? [popState()] : [],
      ),
      ...keywordTable(constants, "constant.builtin"),
      ...shellFunctions,
      { text: "let", then: [keyword, pushState("let"), pushState("letStart")] },
      { text: "inherit", then: [keyword, pushState("inherit")] },
      { text: "with", then: [keyword, pushState("control")] },
      { text: "assert", then: [keyword, pushState("control")] },
    ],
    [paint("variable")],
  );

const expression = ({ context = "expression" }: { context?: "expression" | "let" } = {}): Arm[] => [
  token("#", "comment", pushState("lineComment")),
  token("/*", "comment", pushState("blockComment")),
  on(alpha, cachedPrefix("uri", alpha, uriScheme, literal(":"), bytes(uriPart)), paint("text.uri")),
  on(
    "<",
    literal("<"),
    bytes(pathPart),
    repeat(literal("/"), bytes(pathPart)),
    literal(">"),
    string,
  ),
  on(
    pathPart,
    cachedPrefix("path", pathPart, pathPart, literal("/"), pathTail),
    string,
    pushState("path"),
  ),
  on("/", literal("/"), pathTail, string, pushState("path")),
  on("~", literal("~/"), pathTail, string, pushState("path")),
  token('"', "string", pushState("double")),
  token("''", "string", pushState("indented")),
  token("${", "punctuation.special", pushState("interpolation")),
  token("{", "punctuation.bracket", pushState("braces"), pushState("bracesStart")),
  token("(", "punctuation.bracket", pushState("parentheses")),
  on(
    ".0123456789",
    choice(
      [
        choice(
          [bytes(digit), literal("."), bytes(digit, { min: 0 })],
          [literal("."), bytes(digit)],
        ),
        optional(byte("eE"), optional(byte("+-")), bytes(digit)),
      ],
      [bytes(digit)],
    ),
    paint("number"),
  ),
  on(start, ...identifier, expressionWords(context)),
  ...["->", "//", "++", "==", "!=", "<=", ">=", "&&", "||"].map((text) =>
    on(text[0]!, literal(text), paint("operator")),
  ),
  token(oneOf("+-*/!<>?@"), "operator"),
  token(oneOf(")[]"), "punctuation.bracket"),
  token(oneOf(";,:.="), "punctuation.delimiter"),
];

const braceCandidate = classify(
  [
    { text: "inherit", then: [keyword, popState(), pushState("inherit")] },
    ...constants.map((text) => ({
      text,
      then: [builtin, markRecord(), setState("braceCandidate")],
    })),
  ],
  [paint("variable"), markRecord(), setState("braceCandidate")],
);
const letInitial = classify(
  [
    { text: "inherit", then: [keyword, setState("inherit")] },
    { text: "in", then: [keyword, popState(), popState()] },
  ],
  [member, setState("binding")],
);
const bindingStart = (context: "let" | "braces" | "shellApplication") =>
  classify(
    [
      { text: "inherit", then: [keyword, setState(context), pushState("inherit")] },
      ...(context === "let" ? [{ text: "in", then: [keyword, popState()] }] : []),
    ],
    [member, setState(context), pushState("binding")],
  );
const afterSemicolon = ({ context }: { context: "let" | "braces" | "shellApplication" }): Arm[] => [
  ...trivia,
  ...shellBindings([setState(context)], context === "shellApplication"),
  on(start, ...identifier, bindingStart(context)),
  token('"', "string", setState(context), pushState("binding"), pushState("double")),
  token(
    "${",
    "punctuation.special",
    setState(context),
    pushState("binding"),
    pushState("interpolation"),
  ),
];

const attrset = (context: "braces" | "shellApplication"): Record<string, State> => ({
  [context]: {
    style: "plain",
    arms: [
      token("}", "punctuation.bracket", popState()),
      token(";", "punctuation.delimiter", setState(`${context}After`)),
      ...expression(),
    ],
  },
  [`${context}After`]: {
    style: "plain",
    arms: afterSemicolon({ context }),
    otherwise: [setState(context)],
  },
  [`${context}Start`]: {
    style: "plain",
    arms: [
      ...trivia,
      ...shellBindings([popState()], context === "shellApplication"),
      on(start, ...identifier, braceCandidate),
      token('"', "string", setState("braceDynamic"), pushState("double")),
      token("${", "punctuation.special", setState("braceDynamic"), pushState("interpolation")),
    ],
    otherwise: [popState()],
  },
});

export default defineGrammar({
  initial: "root",
  name: "nix",
  extensions: ["nix"],
  states: withShell(
    {
      root: { style: "plain", arms: [token("}", "punctuation.bracket"), ...expression()] },
      ...attrset("braces"),
      ...attrset("shellApplication"),
      braceCandidate: {
        style: "plain",
        arms: [
          ...trivia,
          on(
            ".",
            literal("."),
            patchRecord("variable.member"),
            delimiter,
            popState(),
            pushState("binding"),
            pushState("bindingPart"),
          ),
          on(
            "=",
            literal("="),
            notNext("="),
            patchRecord("variable.member"),
            delimiter,
            popState(),
          ),
        ],
        otherwise: [popState()],
      },
      braceDynamic: {
        style: "plain",
        arms: [
          ...trivia,
          token('"', "string", pushState("double")),
          token("${", "punctuation.special", pushState("interpolation")),
          token(
            ".",
            "punctuation.delimiter",
            popState(),
            pushState("binding"),
            pushState("bindingPart"),
          ),
          on("=", literal("="), notNext("="), delimiter, popState()),
        ],
        otherwise: [popState()],
      },
      let: {
        style: "plain",
        arms: [
          token(";", "punctuation.delimiter", setState("letAfter")),
          ...expression({ context: "let" }),
        ],
      },
      letAfter: {
        style: "plain",
        arms: afterSemicolon({ context: "let" }),
        otherwise: [setState("let")],
      },
      letStart: {
        style: "plain",
        arms: [
          ...trivia,
          ...shellBindings([popState()]),
          on(start, ...identifier, letInitial),
          token('"', "string", setState("binding"), pushState("double")),
          token("${", "punctuation.special", setState("binding"), pushState("interpolation")),
        ],
        otherwise: [popState()],
      },
      binding: {
        style: "plain",
        arms: [
          ...trivia,
          token(".", "punctuation.delimiter", pushState("bindingPart")),
          on("=", literal("="), notNext("="), delimiter, popState()),
        ],
        otherwise: [popState()],
      },
      bindingPart: {
        style: "plain",
        arms: [
          ...trivia,
          ...shellBindings([popState(), popState()]),
          on(start, ...identifier, member),
          token('"', "string", popState(), pushState("double")),
          token("${", "punctuation.special", popState(), pushState("interpolation")),
        ],
        otherwise: [popState()],
      },
      inherit: {
        style: "plain",
        arms: [
          ...trivia,
          token("(", "punctuation.bracket", pushState("parentheses")),
          on(start, ...identifier, member),
          token('"', "string", pushState("double")),
          token("${", "punctuation.special", pushState("interpolation")),
        ],
        otherwise: [popState()],
      },
      control: {
        style: "plain",
        arms: [token(";", "punctuation.delimiter", popState()), ...expression()],
      },
      parentheses: {
        style: "plain",
        arms: [token(")", "punctuation.bracket", popState()), ...expression()],
      },
      interpolation: {
        style: "plain",
        arms: [token("}", "punctuation.special", popState()), ...expression()],
      },
      double: {
        style: "string",
        arms: [
          on("\\", literal("\\"), character(), paint("string.escape")),
          token("$$", "string"),
          token("${", "punctuation.special", pushState("interpolation")),
          token('"', "string", popState()),
        ],
      },
      indented: {
        style: "string",
        arms: [
          token("'''", "string.escape"),
          token("''$", "string.escape"),
          on("'", literal("''\\"), character(), paint("string.escape")),
          token("$$", "string"),
          token("${", "punctuation.special", pushState("interpolation")),
          token("''", "string", popState()),
        ],
      },
      path: {
        style: "plain",
        arms: [
          on(pathPart, bytes(pathPart), string),
          on("/", literal("/"), notNext("/"), string),
          token("${", "punctuation.special", pushState("interpolation")),
        ],
        otherwise: [popState()],
      },
      lineComment: { style: "comment", arms: [token("\n", "plain", popState())] },
      blockComment: {
        style: "comment",
        arms: [token("*/", "comment", popState())],
      },
    },
    trivia,
  ),
});
