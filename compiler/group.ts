import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";

const dollar = "$".charCodeAt(0);
const openParen = "(".charCodeAt(0);
const closeParen = ")".charCodeAt(0);
const openBrace = "{".charCodeAt(0);
const closeBrace = "}".charCodeAt(0);
const singleQuote = "'".charCodeAt(0);
const doubleQuote = '"'.charCodeAt(0);
const backtick = "`".charCodeAt(0);
const backslash = "\\".charCodeAt(0);
const newline = "\n".charCodeAt(0);
const groupKind = { parentheses: 0, braces: 1, arithmetic: 2, backtick: 3 } as const;
const maxNestedDepth = 2;

export const groupWat = `
  (func $groupNested (param $input i32) (param $cursor i32) (param $end i32) (param $depth i32)
    (result i32)
    (local $byte i32) (local $nextByte i32)
    (if (i32.or (i32.eqz (local.get $depth)) (i32.ge_u (local.get $cursor) (local.get $end)))
      (then (return (i32.const -1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if
      (i32.and
        (i32.eq (local.get $byte) (i32.const ${dollar}))
        (i32.lt_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
      (then
        (local.set $nextByte
          (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1)))))
        (if (i32.or (i32.eq (local.get $nextByte) (i32.const ${openParen})) (i32.eq (local.get $nextByte) (i32.const ${openBrace})))
          (then
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.eq (local.get $nextByte) (i32.const ${openBrace}))
                (i32.sub (local.get $depth) (i32.const 1))))))))
    (if (i32.eq (local.get $byte) (i32.const ${openParen}))
      (then
        (return
          (call $groupBody
            (local.get $input)
            (i32.add (local.get $cursor) (i32.const 1))
            (local.get $end)
            (i32.const ${groupKind.parentheses})
            (i32.sub (local.get $depth) (i32.const 1))))))
    (i32.const -1))
  (func $groupQuote (param $input i32) (param $cursor i32) (param $end i32) (param $quote i32)
    (param $depth i32) (result i32)
    (local $byte i32) (local $next i32)
    (block $fail (loop $more
      (br_if $fail (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (if (i32.eq (local.get $byte) (local.get $quote))
        (then (return (i32.add (local.get $cursor) (i32.const 1)))))
      (br_if $fail (i32.eq (local.get $byte) (i32.const ${newline})))
      (if
        (i32.and (i32.eq (local.get $byte) (i32.const ${backslash})) (i32.ne (local.get $quote) (i32.const ${singleQuote})))
        (then
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.eq
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${newline})))
          (local.set $cursor (i32.add (local.get $cursor) (i32.const 2)))
          (br $more)))
      (if (i32.eq (local.get $quote) (i32.const ${doubleQuote}))
        (then
          (local.set $next
            (call $groupNested
              (local.get $input)
              (local.get $cursor)
              (local.get $end)
              (local.get $depth)))
          (if (i32.ge_s (local.get $next) (i32.const 0))
            (then
              (local.set $cursor (local.get $next))
              (br $more)))))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
      (br $more)))
    (i32.const -1))
  (func $groupBody (param $input i32) (param $cursor i32) (param $end i32) (param $kind i32)
    (param $depth i32) (result i32)
    (local $byte i32) (local $closing i32) (local $next i32)
    (local.set $closing
      (if (result i32) (i32.eq (local.get $kind) (i32.const ${groupKind.braces}))
        (then (i32.const ${closeBrace}))
        (else
          (if (result i32) (i32.eq (local.get $kind) (i32.const ${groupKind.backtick}))
            (then (i32.const ${backtick}))
            (else (i32.const ${closeParen}))))))
    (block $fail (loop $more
      (br_if $fail (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
      (if (i32.eq (local.get $byte) (local.get $closing))
        (then
          (if (i32.ne (local.get $kind) (i32.const ${groupKind.arithmetic}))
            (then (return (i32.add (local.get $cursor) (i32.const 1)))))
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.ne
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${closeParen})))
          (return (i32.add (local.get $cursor) (i32.const 2)))))
      (br_if $fail (i32.eq (local.get $byte) (i32.const ${newline})))
      (if (i32.eq (local.get $byte) (i32.const ${backslash}))
        (then
          (br_if $fail (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
          (br_if $fail
            (i32.eq
              (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1))))
              (i32.const ${newline})))
          (local.set $cursor (i32.add (local.get $cursor) (i32.const 2)))
          (br $more)))
      (if
        (i32.or
          (i32.eq (local.get $byte) (i32.const ${singleQuote}))
          (i32.or (i32.eq (local.get $byte) (i32.const ${doubleQuote})) (i32.eq (local.get $byte) (i32.const ${backtick}))))
        (then
          (local.set $next
            (call $groupQuote
              (local.get $input)
              (i32.add (local.get $cursor) (i32.const 1))
              (local.get $end)
              (local.get $byte)
              (local.get $depth)))
          (br_if $fail (i32.lt_s (local.get $next) (i32.const 0)))
          (local.set $cursor (local.get $next))
          (br $more)))
      (local.set $next
        (call $groupNested (local.get $input) (local.get $cursor) (local.get $end) (local.get $depth)))
      (local.set $cursor
        (if (result i32) (i32.ge_s (local.get $next) (i32.const 0))
          (then (local.get $next))
          (else (i32.add (local.get $cursor) (i32.const 1)))))
      (br $more)))
    (i32.const -1))
  (func $group (param $input i32) (param $cursor i32) (param $end i32) (result i32)
    (local $byte i32) (local $nextByte i32) (local $result i32)
    (if (i32.ge_u (local.get $cursor) (local.get $end)) (then (return (i32.const -1))))
    (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $cursor))))
    (if
      (i32.and
        (i32.eq (local.get $byte) (i32.const ${dollar}))
        (i32.lt_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
      (then
        (local.set $nextByte
          (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 1)))))
        (if (i32.eq (local.get $nextByte) (i32.const ${openParen}))
          (then
            (if (i32.lt_u (i32.add (local.get $cursor) (i32.const 2)) (local.get $end))
              (then
                (if
                  (i32.eq
                    (i32.load8_u
                      (i32.add (local.get $input) (i32.add (local.get $cursor) (i32.const 2))))
                    (i32.const ${openParen}))
                  (then
                    (local.set $result
                      (call $groupBody
                        (local.get $input)
                        (i32.add (local.get $cursor) (i32.const 3))
                        (local.get $end)
                        (i32.const ${groupKind.arithmetic})
                        (i32.const ${maxNestedDepth})))
                    (if (i32.ge_s (local.get $result) (i32.const 0))
                      (then (return (local.get $result))))))))
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.const ${groupKind.parentheses})
                (i32.const ${maxNestedDepth})))))
        (if (i32.eq (local.get $nextByte) (i32.const ${openBrace}))
          (then
            (return
              (call $groupBody
                (local.get $input)
                (i32.add (local.get $cursor) (i32.const 2))
                (local.get $end)
                (i32.const ${groupKind.braces})
                (i32.const ${maxNestedDepth})))))))
    (if (i32.eq (local.get $byte) (i32.const ${backtick}))
      (then
        (return
          (call $groupBody
            (local.get $input)
            (i32.add (local.get $cursor) (i32.const 1))
            (local.get $end)
            (i32.const ${groupKind.backtick})
            (i32.const ${maxNestedDepth})))))
    (i32.const -1))`;

export function lowerGroup(
  m: Extract<Matcher, { kind: "group" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $matchCursor (call $group (local.get $input) (local.get $matchCursor) (local.get $limit)))
    (br_if ${fail} (i32.lt_s (local.get $matchCursor) (i32.const 0)))`;
}
