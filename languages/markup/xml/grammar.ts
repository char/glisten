import {
  byte,
  bytes,
  byteSet,
  character,
  choice,
  classify,
  defineGrammar,
  keywordTable,
  literal,
  lookahead,
  notLookahead,
  notNext,
  on,
  oneOf,
  paint,
  popState,
  pushState,
  range,
  repeat,
  setState,
  token,
  union,
} from "#/grammar/mod.ts";

const all = byteSet({ ranges: [[0, 255]] });
const alpha = union(range("a", "z"), range("A", "Z"));
const digit = range("0", "9");
const hex = union(digit, range("a", "f"), range("A", "F"));
const nonAscii = byteSet({ ranges: [[128, 255]] });
const asciiStart = union(alpha, "_:");
const asciiRest = union(asciiStart, digit, ".-");
const nameStart = union(asciiStart, nonAscii);
const nameRest = union(asciiRest, nonAscii);
const unicodeName = [
  notLookahead(literal("\u0085")),
  notLookahead(literal("\u2028")),
  lookahead(byte(nonAscii)),
  character(),
];
const namePart = choice([bytes(asciiRest)], unicodeName);
const name = [choice([byte(asciiStart)], unicodeName), repeat(namePart)];
const nameBoundary = choice(
  [lookahead(literal("\u0085"))],
  [lookahead(literal("\u2028"))],
  [notNext(nameRest)],
);
const reference = on(
  "&",
  literal("&"),
  choice([literal("#x"), bytes(hex)], [literal("#"), bytes(digit)], name),
  literal(";"),
  paint("string.escape"),
);
const parameter = on("%", literal("%"), ...name, literal(";"), paint("string.escape"));
const quoteArms = [
  token('"', "string", pushState("double")),
  token("'", "string", pushState("single")),
];
const dtdQuoteArms = [
  token('"', "string", pushState("dtdDouble")),
  token("'", "string", pushState("dtdSingle")),
];
const literalQuoteArms = [
  token('"', "string", pushState("literalDouble")),
  token("'", "string", pushState("literalSingle")),
];
const comment = token("<!--", "comment", pushState("comment"));
const processing = token("<?", "punctuation.bracket", pushState("piTarget"));
const dtdWords = `
  ENTITY NOTATION SYSTEM PUBLIC NDATA EMPTY ANY CDATA ID IDREF IDREFS ENTITIES NMTOKEN NMTOKENS
  INCLUDE IGNORE
`
  .trim()
  .split(/\s+/);
const dtdWord = on(
  nameStart,
  ...name,
  classify(keywordTable(dtdWords, "keyword"), [paint("plain")]),
);
const dtdSpecial = on("#", literal("#"), bytes(union(alpha, digit)), paint("keyword"));
const dtdPunctuation = [
  token(oneOf("()[]"), "punctuation.bracket"),
  token(oneOf("|,?*+%"), "operator"),
];

export default defineGrammar({
  name: "xml",
  aliases: ["svg", "xsl", "xslt", "xsd", "rss", "atom", "plist", "wsdl"],
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        comment,
        token("<![CDATA[", "punctuation.bracket", pushState("cdata")),
        on(
          "<",
          literal("<!"),
          lookahead(
            literal("DOCTYPE"),
            choice([byte(" \t\r\n")], [literal("\u0085")], [literal("\u2028")]),
          ),
          paint("punctuation.bracket"),
          pushState("doctype"),
        ),
        processing,
        on(
          "<",
          literal("</"),
          lookahead(byte(nameStart)),
          paint("punctuation.bracket"),
          pushState("elementName"),
        ),
        on(
          "<",
          literal("<"),
          lookahead(byte(nameStart)),
          paint("punctuation.bracket"),
          pushState("elementName"),
        ),
        reference,
      ],
    },
    elementName: {
      style: "plain",
      arms: [on(nameStart, ...name, paint("tag"), setState("tag"))],
      otherwise: [popState()],
    },
    tag: {
      style: "plain",
      arms: [
        token("/>", "punctuation.bracket", popState()),
        token(">", "punctuation.bracket", popState()),
        on(nameStart, ...name, paint("attribute")),
        token("=", "operator"),
        ...quoteArms,
      ],
    },
    double: { style: "string", arms: [reference, token('"', "string", popState())] },
    single: { style: "string", arms: [reference, token("'", "string", popState())] },
    dtdDouble: { style: "string", arms: [reference, parameter, token('"', "string", popState())] },
    dtdSingle: { style: "string", arms: [reference, parameter, token("'", "string", popState())] },
    literalDouble: { style: "string", arms: [token('"', "string", popState())] },
    literalSingle: { style: "string", arms: [token("'", "string", popState())] },
    comment: { style: "comment", arms: [token("-->", "comment", popState())] },
    cdata: { style: "string", arms: [token("]]>", "punctuation.bracket", popState())] },
    piTarget: {
      style: "plain",
      arms: [
        on("x", literal("xml"), nameBoundary, paint("keyword"), setState("piXml")),
        ...["xml-stylesheet", "xml-model"].map((target) =>
          on("x", literal(target), nameBoundary, paint("keyword"), setState("piXml")),
        ),
        on(nameStart, ...name, paint("keyword"), setState("piBody")),
        token("?>", "punctuation.bracket", popState()),
      ],
    },
    piBody: { style: "plain", arms: [token("?>", "punctuation.bracket", popState())] },
    piXml: {
      style: "plain",
      arms: [
        token("?>", "punctuation.bracket", popState()),
        on(nameStart, ...name, paint("attribute")),
        token("=", "operator"),
        ...quoteArms,
      ],
    },
    doctype: {
      style: "plain",
      arms: [token("DOCTYPE", "keyword", setState("doctypeName"))],
    },
    doctypeName: {
      style: "plain",
      arms: [on(nameStart, ...name, paint("type"), setState("doctypeBody"))],
    },
    doctypeBody: {
      style: "plain",
      arms: [
        dtdWord,
        token("[", "punctuation.bracket", pushState("subset")),
        token(">", "punctuation.bracket", popState()),
        ...literalQuoteArms,
        parameter,
      ],
    },
    subset: {
      style: "plain",
      arms: [
        comment,
        processing,
        token("<!", "punctuation.bracket", pushState("declarationHead")),
        token("]", "punctuation.bracket", popState()),
        parameter,
      ],
    },
    declarationHead: {
      style: "plain",
      arms: [
        on("E", literal("ELEMENT"), nameBoundary, paint("keyword"), setState("declarationTag")),
        on("A", literal("ATTLIST"), nameBoundary, paint("keyword"), setState("attlistTag")),
        on("E", literal("ENTITY"), nameBoundary, paint("keyword"), setState("entityName")),
        on("N", literal("NOTATION"), nameBoundary, paint("keyword"), setState("declarationLabel")),
      ],
      otherwise: [setState("declaration")],
    },
    declarationTag: {
      style: "plain",
      arms: [on(nameStart, ...name, paint("tag"), setState("declaration"))],
    },
    attlistTag: {
      style: "plain",
      arms: [on(nameStart, ...name, paint("tag"), setState("attlistAttribute"))],
    },
    attlistAttribute: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        parameter,
        on(nameStart, ...name, paint("attribute"), setState("attlistType")),
      ],
    },
    attlistType: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        parameter,
        on("N", literal("NOTATION"), nameBoundary, paint("keyword"), setState("attlistNotation")),
        ...["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"].map(
          (word) =>
            on(
              nameStart,
              literal(word),
              nameBoundary,
              paint("keyword"),
              setState("attlistDefault"),
            ),
        ),
        token(
          "(",
          "punctuation.bracket",
          setState("attlistDefault"),
          pushState("attlistEnumeration"),
        ),
      ],
    },
    attlistNotation: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        parameter,
        token(
          "(",
          "punctuation.bracket",
          setState("attlistDefault"),
          pushState("attlistEnumeration"),
        ),
      ],
    },
    attlistEnumeration: {
      style: "plain",
      arms: [
        token(")", "punctuation.bracket", popState()),
        token("|", "operator"),
        parameter,
        on(nameRest, namePart, repeat(namePart), paint("string")),
      ],
    },
    attlistDefault: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        token("#REQUIRED", "keyword", setState("attlistAttribute")),
        token("#IMPLIED", "keyword", setState("attlistAttribute")),
        token("#FIXED", "keyword"),
        token('"', "string", setState("attlistAttribute"), pushState("double")),
        token("'", "string", setState("attlistAttribute"), pushState("single")),
        parameter,
      ],
    },
    declarationLabel: {
      style: "plain",
      arms: [
        token("%", "operator"),
        on(nameStart, ...name, paint("label"), setState("declaration")),
      ],
    },
    entityName: {
      style: "plain",
      arms: [
        token("%", "operator"),
        on(nameStart, ...name, paint("label"), setState("entityBody")),
      ],
    },
    entityBody: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        on(
          "SP",
          choice([literal("SYSTEM")], [literal("PUBLIC")]),
          nameBoundary,
          paint("keyword"),
          setState("external"),
        ),
        ...dtdQuoteArms,
        reference,
        parameter,
        dtdWord,
      ],
    },
    external: {
      style: "plain",
      arms: [token(">", "punctuation.bracket", popState()), ...literalQuoteArms, dtdWord],
    },
    declaration: {
      style: "plain",
      arms: [
        token(">", "punctuation.bracket", popState()),
        comment,
        processing,
        on(
          "SP",
          choice([literal("SYSTEM")], [literal("PUBLIC")]),
          nameBoundary,
          paint("keyword"),
          setState("external"),
        ),
        ...quoteArms,
        reference,
        parameter,
        dtdSpecial,
        dtdWord,
        ...dtdPunctuation,
      ],
    },
  },
});
