import { func, global, raw, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
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
  const reset = func(
    "inlineHtmlReset",
    () => wat`${missing.map((g) => wat`(global.set ${g} (i32.const -1))`)}`,
  );
  const peek = (cursor: string) =>
    wat`(call ${ranges.peek} (local.get $input) (local.get ${raw(cursor)}) (local.get $limit))`;
  const advance = (cursor: string) =>
    wat`(local.set ${raw(cursor)} (call ${ranges.advance} (local.get ${raw(cursor)}) (local.get $limit)))`;
  const pos = (cursor: string) => wat`(i32.wrap_i64 (local.get ${raw(cursor)}))`;
  /** The cursor after the first occurrence of a terminator at or after the cursor, or -1. */
  const find = terminators.map((terminator, i) =>
    func(
      `inlineHtmlFind${i}`,
      () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $start i32) (local $look i64) (local $matched i32)
      (local.set $start ${pos("$cursor")})
      (if (i32.and (i32.ne (global.get ${missing[i]!}) (i32.const -1))
        (i32.ge_u (local.get $start) (global.get ${missing[i]!})))
        (then (return (i64.const -1))))
      (block $none (loop $search
        (call ${charge} (i64.const 1))
        (br_if $none (i32.eq ${peek("$cursor")} (i32.const -1)))
        (local.set $look (local.get $cursor))
        (local.set $matched (i32.const 1))
        ${[...terminator].map(
          (char) => wat`
        (if (local.get $matched) (then
          (if (i32.eq ${peek("$look")} (i32.const ${char.charCodeAt(0)}))
            (then ${advance("$look")})
            (else (local.set $matched (i32.const 0))))))`,
        )}
        (if (local.get $matched) (then (return (local.get $look))))
        ${advance("$cursor")}
        (br $search)))
      (global.set ${missing[i]!} (local.get $start))
      (i64.const -1)`,
    ),
  );
  const call = (i: number, cursor: string) =>
    wat`(call ${find[i]!} (local.get $input) (local.get ${raw(cursor)}) (local.get $limit))`;
  const alpha = (c: Fragment) =>
    wat`(i32.le_u (i32.sub (i32.or ${c} (i32.const 32)) (i32.const 97)) (i32.const 25))`;
  const digit = (c: Fragment) => wat`(i32.le_u (i32.sub ${c} (i32.const 48)) (i32.const 9))`;
  const space = (
    c: Fragment,
  ) => wat`(i32.or (i32.or (i32.eq ${c} (i32.const 32)) (i32.eq ${c} (i32.const 9)))
    (i32.or (i32.eq ${c} (i32.const 10)) (i32.eq ${c} (i32.const 13))))`;
  const is = (c: Fragment, char: string) => wat`(i32.eq ${c} (i32.const ${char.charCodeAt(0)}))`;
  const c = wat`(local.get $c)`;
  const read = wat`(local.set $c ${peek("$cursor")})`;
  const skip = (test: Fragment) => wat`
    (block $skipped (loop $skipping
      ${read}
      (br_if $skipped (i32.eqz ${test}))
      ${advance("$cursor")}
      (br $skipping)))`;
  const parse = func(
    "inlineHtml",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $c i32) (local $spaced i32) (local $look i64)
    ${advance("$cursor")}
    ${read}
    ;; <!-- comment -->, <!DECLARATION>, <![CDATA[ ... ]]>
    (if ${is(c, "!")} (then
      ${advance("$cursor")}
      ${read}
      (if ${is(c, "-")} (then
        ${advance("$cursor")}
        (if (i32.eqz ${is(peek("$cursor"), "-")}) (then (return (i64.const -1))))
        ${advance("$cursor")}
        ;; <!--> and <!---> are complete comments.
        (if ${is(peek("$cursor"), ">")} (then ${advance("$cursor")} (return (local.get $cursor))))
        (local.set $look (local.get $cursor))
        ${advance("$look")}
        (if (i32.and ${is(peek("$cursor"), "-")} ${is(peek("$look"), ">")}) (then
          ${advance("$look")} (return (local.get $look))))
        (return ${call(0, "$cursor")})))
      (if ${is(c, "[")} (then
        ${[..."CDATA["].map(
          (char) => wat`
        ${advance("$cursor")}
        (if (i32.eqz ${is(peek("$cursor"), char)}) (then (return (i64.const -1))))`,
        )}
        ${advance("$cursor")}
        (return ${call(2, "$cursor")})))
      (if ${alpha(c)} (then (return ${call(3, "$cursor")})))
      (return (i64.const -1))))
    ;; <? processing instruction ?>
    (if ${is(c, "?")} (then ${advance("$cursor")} (return ${call(1, "$cursor")})))
    ;; </closing>
    (if ${is(c, "/")} (then
      ${advance("$cursor")}
      (if (i32.eqz ${alpha(peek("$cursor"))}) (then (return (i64.const -1))))
      ${skip(wat`(i32.or (i32.or ${alpha(c)} ${digit(c)}) ${is(c, "-")})`)}
      ${skip(space(c))}
      (if (i32.eqz ${is(c, ">")}) (then (return (i64.const -1))))
      ${advance("$cursor")}
      (return (local.get $cursor))))
    ;; <open attribute="value" ... />
    (if (i32.eqz ${alpha(c)}) (then (return (i64.const -1))))
    ${skip(wat`(i32.or (i32.or ${alpha(c)} ${digit(c)}) ${is(c, "-")})`)}
    (block $attributes (loop $attribute
      (call ${charge} (i64.const 1))
      ${read}
      (local.set $spaced ${space(c)})
      ${skip(space(c))}
      (br_if $attributes (i32.or ${is(c, ">")} ${is(c, "/")}))
      ;; An attribute needs whitespace before it, and a name.
      (if (i32.or (i32.eqz (local.get $spaced))
        (i32.eqz (i32.or ${alpha(c)} (i32.or ${is(c, "_")} ${is(c, ":")}))))
        (then (return (i64.const -1))))
      ${skip(wat`(i32.or (i32.or ${alpha(c)} ${digit(c)})
        (i32.or (i32.or ${is(c, "_")} ${is(c, ".")}) (i32.or ${is(c, ":")} ${is(c, "-")})))`)}
      ;; An optional value: whitespace, "=", whitespace, then a quoted or unquoted value.
      (local.set $look (local.get $cursor))
      ${skip(space(c))}
      (if (i32.eqz ${is(c, "=")}) (then
        (local.set $cursor (local.get $look))
        (br $attribute)))
      ${advance("$cursor")}
      ${skip(space(c))}
      (if (i32.or ${is(c, '"')} ${is(c, "'")})
        (then
          ${advance("$cursor")}
          (local.set $cursor (if (result i64) ${is(c, '"')} (then ${call(4, "$cursor")}) (else ${call(5, "$cursor")})))
          (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1)))))
        (else
          (local.set $look (local.get $cursor))
          ${skip(wat`(i32.and (i32.ne ${c} (i32.const -1)) (i32.eqz (i32.or ${space(c)}
            (i32.or (i32.or ${is(c, '"')} ${is(c, "'")}) (i32.or (i32.or ${is(c, "=")} ${is(c, "<")})
              (i32.or ${is(c, ">")} ${is(c, "`")}))))))`)}
          (if (i64.eq (local.get $cursor) (local.get $look)) (then (return (i64.const -1))))))
      (br $attribute)))
    (if ${is(c, "/")} (then ${advance("$cursor")} ${read}))
    (if (i32.eqz ${is(c, ">")}) (then (return (i64.const -1))))
    ${advance("$cursor")}
    (local.get $cursor)`,
  );
  return { reset, parse };
}
