import { func, global, raw, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
import { cursorPosition } from "./cursor.ts";
import { logicalRanges } from "./logical.ts";

/**
 * CommonMark raw HTML (§6.6) at a "<": open and closing tags, comments, processing
 * instructions, declarations, and CDATA sections, over logical ranges. Returns the end,
 * or -1.
 *
 * A search for a terminator that reaches the end of the paragraph remembers where it
 * started: later searches from there on fail at once, so repeated unclosed openers stay
 * linear. Call `reset` for each paragraph.
 */
export function inlineHtml(ranges: ReturnType<typeof logicalRanges>, charge: Def) {
  const terminators = ["-->", "?>", "]]>", ">", '"', "'"] as const;
  const missing = terminators.map((_, i) =>
    global(`inlineHtmlMissing${i}`, () => wat`(mut i32) (i32.const -1)`),
  );
  const resetMissing = missing.map((entry) => wat`(global.set ${entry} (i32.const -1))`);
  const reset = func("inlineHtmlReset", () => wat`${resetMissing}`);
  const peek = (cursor: string) =>
    wat`(call ${ranges.peek} (local.get $input) (local.get ${raw(cursor)}) (local.get $limit))`;
  const advance = (cursor: string) =>
    wat`(local.set ${raw(cursor)}
      (call ${ranges.advance} (local.get ${raw(cursor)}) (local.get $limit)))`;
  const pos = (cursor: string) => cursorPosition(wat`(local.get ${raw(cursor)})`);
  /** The cursor after the first occurrence of a terminator at or after the cursor, or -1. */
  const find = terminators.map((terminator, i) => {
    const lookByte = peek("$look");
    const advanceLook = advance("$look");
    const matchTerminator = [...terminator].map((char) => {
      const code = char.charCodeAt(0);
      return wat`
        (if (local.get $matched)
          (then
            (if (i32.eq ${lookByte} (i32.const ${code}))
              (then ${advanceLook})
              (else (local.set $matched (i32.const 0))))))`;
    });
    return func(
      `inlineHtmlFind${i}`,
      () => wat`
        (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
        (local $start i32) (local $look i64) (local $matched i32)
        (local.set $start ${pos("$cursor")})
        (if
          (i32.and
            (i32.ne (global.get ${missing[i]!}) (i32.const -1))
            (i32.ge_u (local.get $start) (global.get ${missing[i]!})))
          (then (return (i64.const -1))))
        (block $none (loop $search
          (call ${charge} (i64.const 1))
          (br_if $none (i32.eq ${peek("$cursor")} (i32.const -1)))
          (local.set $look (local.get $cursor))
          (local.set $matched (i32.const 1))
          ${matchTerminator}
          (if (local.get $matched) (then (return (local.get $look))))
          ${advance("$cursor")}
          (br $search)))
        (global.set ${missing[i]!} (local.get $start))
        (i64.const -1)`,
    );
  });
  const [commentEnd, processingEnd, cdataEnd, declarationEnd, doubleQuoteEnd, singleQuoteEnd] =
    find;
  const call = (search: Def, cursor: string) =>
    wat`(call ${search} (local.get $input) (local.get ${raw(cursor)}) (local.get $limit))`;
  const asciiCaseBit = 0x20;
  const charCode = (character: string) => character.charCodeAt(0);
  const asciiLetterSpan = charCode("z") - charCode("a");
  const asciiDigitSpan = charCode("9") - charCode("0");
  const alpha = (byte: Fragment) =>
    wat`(i32.le_u (i32.sub (i32.or ${byte} (i32.const ${asciiCaseBit})) (i32.const ${charCode("a")})) (i32.const ${asciiLetterSpan}))`;
  const digit = (byte: Fragment) =>
    wat`(i32.le_u (i32.sub ${byte} (i32.const ${charCode("0")})) (i32.const ${asciiDigitSpan}))`;
  const space = (byte: Fragment) => wat`(i32.or
    (i32.or (i32.eq ${byte} (i32.const ${charCode(" ")})) (i32.eq ${byte} (i32.const ${charCode("\t")})))
    (i32.or (i32.eq ${byte} (i32.const ${charCode("\n")})) (i32.eq ${byte} (i32.const ${charCode("\r")}))))`;
  const is = (byte: Fragment, char: string) =>
    wat`(i32.eq ${byte} (i32.const ${char.charCodeAt(0)}))`;
  const byte = wat`(local.get $byte)`;
  const read = wat`(local.set $byte ${peek("$cursor")})`;
  const skip = (test: Fragment) => wat`
    (block $skipped (loop $skipping ${read}
      (br_if $skipped (i32.eqz ${test}))
      ${advance("$cursor")}
      (br $skipping)))`;
  const cdataOpener = [..."CDATA["].map((char) => {
    const matchesByte = is(peek("$cursor"), char);
    return wat`
      ${advance("$cursor")}
      (if (i32.eqz ${matchesByte}) (then (return (i64.const -1))))`;
  });
  const tagName = skip(wat`(i32.or (i32.or ${alpha(byte)} ${digit(byte)}) ${is(byte, "-")})`);
  const attributeName = skip(wat`(i32.or
    (i32.or ${alpha(byte)} ${digit(byte)})
    (i32.or (i32.or ${is(byte, "_")} ${is(byte, ".")}) (i32.or ${is(byte, ":")} ${is(byte, "-")})))`);
  const unquotedValue = skip(wat`(i32.and
    (i32.ne ${byte} (i32.const -1))
    (i32.eqz
      (i32.or ${space(byte)}
        (i32.or
          (i32.or ${is(byte, '"')} ${is(byte, "'")})
          (i32.or (i32.or ${is(byte, "=")} ${is(byte, "<")}) (i32.or ${is(byte, ">")} ${is(byte, "`")}))))))`);
  const advanceCursor = advance("$cursor");
  const advanceLook = advance("$look");
  const isDeclaration = is(byte, "!");
  const isDash = is(byte, "-");
  const cursorIsDash = is(peek("$cursor"), "-");
  const cursorIsTagEnd = is(peek("$cursor"), ">");
  const lookIsTagEnd = is(peek("$look"), ">");
  const isCdata = is(byte, "[");
  const isLetter = alpha(byte);
  const isProcessingInstruction = is(byte, "?");
  const isSlash = is(byte, "/");
  const cursorIsLetter = alpha(peek("$cursor"));
  const skipSpace = skip(space(byte));
  const isSpace = space(byte);
  const isTagEnd = is(byte, ">");
  const isUnderscore = is(byte, "_");
  const isColon = is(byte, ":");
  const isEquals = is(byte, "=");
  const isDoubleQuote = is(byte, '"');
  const isSingleQuote = is(byte, "'");
  const findCommentEnd = call(commentEnd!, "$cursor");
  const findProcessingEnd = call(processingEnd!, "$cursor");
  const findCdataEnd = call(cdataEnd!, "$cursor");
  const findDeclarationEnd = call(declarationEnd!, "$cursor");
  const findDoubleQuote = call(doubleQuoteEnd!, "$cursor");
  const findSingleQuote = call(singleQuoteEnd!, "$cursor");
  const parse = func(
    "inlineHtml",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $byte i32) (local $spaced i32) (local $look i64)
      ${advanceCursor}
      ${read}
      ;; <!-- comment -->, <!DECLARATION>, <![CDATA[ ... ]]>
      (if ${isDeclaration}
        (then ${advanceCursor} ${read}
          (if ${isDash}
            (then ${advanceCursor}
              (if (i32.eqz ${cursorIsDash}) (then (return (i64.const -1))))
              ${advanceCursor}
              ;; <!--> and <!---> are complete comments.
              (if ${cursorIsTagEnd}
                (then ${advanceCursor}
                  (return (local.get $cursor))))
              (local.set $look (local.get $cursor))
              ${advanceLook}
              (if (i32.and ${cursorIsDash} ${lookIsTagEnd})
                (then ${advanceLook}
                  (return (local.get $look))))
              (return ${findCommentEnd})))
          (if ${isCdata}
            (then ${cdataOpener} ${advanceCursor}
              (return ${findCdataEnd})))
          (if ${isLetter} (then (return ${findDeclarationEnd})))
          (return (i64.const -1))))
      ;; <? processing instruction ?>
      (if ${isProcessingInstruction}
        (then ${advanceCursor}
          (return ${findProcessingEnd})))
      ;; </closing>
      (if ${isSlash}
        (then ${advanceCursor}
          (if (i32.eqz ${cursorIsLetter}) (then (return (i64.const -1))))
          ${tagName}
          ${skipSpace}
          (if (i32.eqz ${isTagEnd}) (then (return (i64.const -1))))
          ${advanceCursor}
          (return (local.get $cursor))))
      ;; <open attribute="value" ... />
      (if (i32.eqz ${isLetter}) (then (return (i64.const -1))))
      ${tagName}
      (block $attributes (loop $attribute
        (call ${charge} (i64.const 1))
        ${read}
        (local.set $spaced ${isSpace})
        ${skipSpace}
        (br_if $attributes (i32.or ${isTagEnd} ${isSlash}))
        ;; An attribute needs whitespace before it, and a name.
        (if
          (i32.or
            (i32.eqz (local.get $spaced))
            (i32.eqz (i32.or ${isLetter} (i32.or ${isUnderscore} ${isColon}))))
          (then (return (i64.const -1))))
        ${attributeName}
        ;; An optional value: whitespace, "=", whitespace, then a quoted or unquoted value.
        (local.set $look (local.get $cursor))
        ${skipSpace}
        (if (i32.eqz ${isEquals})
          (then
            (local.set $cursor (local.get $look))
            (br $attribute)))
        ${advanceCursor}
        ${skipSpace}
        (if (i32.or ${isDoubleQuote} ${isSingleQuote})
          (then ${advanceCursor}
            (local.set $cursor
              (if (result i64)
                ${isDoubleQuote}
                (then ${findDoubleQuote})
                (else ${findSingleQuote})))
            (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1)))))
          (else
            (local.set $look (local.get $cursor))
            ${unquotedValue}
            (if (i64.eq (local.get $cursor) (local.get $look)) (then (return (i64.const -1))))))
        (br $attribute)))
      (if ${isSlash}
        (then ${advanceCursor} ${read}))
      (if (i32.eqz ${isTagEnd}) (then (return (i64.const -1))))
      ${advanceCursor}
      (local.get $cursor)`,
  );
  return { reset, parse };
}
