import {
  byte,
  byteSet,
  bytes,
  defineGrammar,
  literal,
  lookahead,
  notNext,
  on,
  paint,
  popState,
  pushState,
  range,
  redispatch,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const letters = union(range("a", "z"), range("A", "Z"), "_");
const identifier = union(letters, range("0", "9"), "$", byteSet({ ranges: [[128, 255]] }));
const name = union(identifier, ".#~");
const space = on(" \t", bytes(" \t"), paint("comment"));
const newline = token("\n", "comment", setState("line"));
const namedTags = `
  param arg argument property prop typeParam template typedef
`
  .trim()
  .split(/\s+/);
const typedTags = `
  return returns type throws throw this satisfies
`
  .trim()
  .split(/\s+/);
const tagArms = (names: readonly string[], target: string) =>
  names.map((name) =>
    on("@", literal(`@${name}`), notNext(identifier), paint("keyword"), setState(target)),
  );

export default defineGrammar({
  name: "jsdoc",
  aliases: ["tsdoc"],
  initial: "line",
  states: {
    line: {
      style: "comment",
      arms: [
        space,
        token("*", "comment"),
        ...tagArms(namedTags, "named"),
        ...tagArms(typedTags, "typed"),
        on(
          "@",
          literal("@"),
          byte(letters),
          bytes(identifier, { min: 0 }),
          paint("keyword"),
          setState("text"),
        ),
        newline,
      ],
      otherwise: [setState("text")],
    },
    text: {
      style: "comment",
      arms: [
        on(
          "{",
          literal("{"),
          lookahead(literal("@"), byte(letters)),
          paint("comment"),
          pushState("inlineTag"),
        ),
        newline,
      ],
    },
    inlineTag: {
      style: "comment",
      arms: [
        on(
          "@",
          literal("@"),
          byte(letters),
          bytes(identifier, { min: 0 }),
          paint("keyword"),
          setState("inlineText"),
        ),
      ],
      otherwise: [setState("inlineText")],
    },
    inlineText: {
      style: "comment",
      arms: [
        token("}", "comment", popState()),
        token("\n", "comment", popState(), setState("line")),
      ],
    },
    named: {
      style: "comment",
      arms: [
        space,
        token("{", "type", setState("parameter"), pushState("type")),
        token("[", "comment", setState("optionalName")),
        on(name, bytes(name), paint("variable"), setState("text")),
        newline,
      ],
      otherwise: [setState("text")],
    },
    parameter: {
      style: "comment",
      arms: [
        space,
        token("[", "comment", setState("optionalName")),
        on(name, bytes(name), paint("variable"), setState("text")),
        newline,
      ],
      otherwise: [setState("text")],
    },
    optionalName: {
      style: "comment",
      arms: [on(name, bytes(name), paint("variable"), setState("optionalTail")), newline],
      otherwise: [setState("text")],
    },
    optionalTail: {
      style: "comment",
      arms: [token("]", "comment", setState("text")), newline],
    },
    typed: {
      style: "comment",
      arms: [space, token("{", "type", setState("text"), pushState("type")), newline],
      otherwise: [setState("text")],
    },
    type: {
      style: "type",
      arms: [
        token("{", "type", pushState("type")),
        token("}", "type", popState()),
        token("\n", "type", setState("typeLine")),
      ],
    },
    typeLine: {
      style: "comment",
      arms: [space, token("*", "comment"), token("\n", "comment")],
      otherwise: [setState("type")],
    },
  },
});
