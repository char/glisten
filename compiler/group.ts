import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";
export const groupWat = `
(func $groupNested (param $input i32) (param $pos i32) (param $end i32) (param $depth i32) (result i32)
  (local $c i32) (local $n i32)
  (if (i32.or (i32.eqz (local.get $depth)) (i32.ge_u (local.get $pos) (local.get $end))) (then (return (i32.const -1))))
  (local.set $c (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
  (if (i32.and (i32.eq (local.get $c) (i32.const 36)) (i32.lt_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end))) (then
    (local.set $n (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 1)))))
    (if (i32.or (i32.eq (local.get $n) (i32.const 40)) (i32.eq (local.get $n) (i32.const 123))) (then
      (return (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 2)) (local.get $end)
        (i32.eq (local.get $n) (i32.const 123)) (i32.sub (local.get $depth) (i32.const 1))))))))
  (if (i32.eq (local.get $c) (i32.const 40)) (then
    (return (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 1)) (local.get $end) (i32.const 0) (i32.sub (local.get $depth) (i32.const 1))))))
  (i32.const -1))
(func $groupQuote (param $input i32) (param $pos i32) (param $end i32) (param $quote i32) (param $depth i32) (result i32)
  (local $c i32) (local $next i32)
  (block $fail (loop $more
    (br_if $fail (i32.ge_u (local.get $pos) (local.get $end)))
    (local.set $c (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.eq (local.get $c) (local.get $quote)) (then (return (i32.add (local.get $pos) (i32.const 1)))))
    (br_if $fail (i32.eq (local.get $c) (i32.const 10)))
    (if (i32.and (i32.eq (local.get $c) (i32.const 92)) (i32.ne (local.get $quote) (i32.const 39))) (then
      (br_if $fail (i32.ge_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))
      (br_if $fail (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 1)))) (i32.const 10)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 2))) (br $more)))
    (if (i32.eq (local.get $quote) (i32.const 34)) (then
      (local.set $next (call $groupNested (local.get $input) (local.get $pos) (local.get $end) (local.get $depth)))
      (if (i32.ge_s (local.get $next) (i32.const 0)) (then (local.set $pos (local.get $next)) (br $more)))))
    (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $more)))
  (i32.const -1))
(func $groupBody (param $input i32) (param $pos i32) (param $end i32) (param $kind i32) (param $depth i32) (result i32)
  (local $c i32) (local $closing i32) (local $next i32)
  (local.set $closing (if (result i32) (i32.eq (local.get $kind) (i32.const 1)) (then (i32.const 125))
    (else (if (result i32) (i32.eq (local.get $kind) (i32.const 3)) (then (i32.const 96)) (else (i32.const 41))))))
  (block $fail (loop $more
    (br_if $fail (i32.ge_u (local.get $pos) (local.get $end)))
    (local.set $c (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
    (if (i32.eq (local.get $c) (local.get $closing)) (then
      (if (i32.ne (local.get $kind) (i32.const 2)) (then (return (i32.add (local.get $pos) (i32.const 1)))))
      (br_if $fail (i32.ge_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))
      (br_if $fail (i32.ne (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 1)))) (i32.const 41)))
      (return (i32.add (local.get $pos) (i32.const 2)))))
    (br_if $fail (i32.eq (local.get $c) (i32.const 10)))
    (if (i32.eq (local.get $c) (i32.const 92)) (then
      (br_if $fail (i32.ge_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end)))
      (br_if $fail (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 1)))) (i32.const 10)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 2))) (br $more)))
    (if (i32.or (i32.eq (local.get $c) (i32.const 39)) (i32.or (i32.eq (local.get $c) (i32.const 34)) (i32.eq (local.get $c) (i32.const 96)))) (then
      (local.set $next (call $groupQuote (local.get $input) (i32.add (local.get $pos) (i32.const 1)) (local.get $end) (local.get $c) (local.get $depth)))
      (br_if $fail (i32.lt_s (local.get $next) (i32.const 0)))
      (local.set $pos (local.get $next)) (br $more)))
    (local.set $next (call $groupNested (local.get $input) (local.get $pos) (local.get $end) (local.get $depth)))
    (local.set $pos (if (result i32) (i32.ge_s (local.get $next) (i32.const 0)) (then (local.get $next)) (else (i32.add (local.get $pos) (i32.const 1)))))
    (br $more)))
  (i32.const -1))
(func $group (param $input i32) (param $pos i32) (param $end i32) (result i32)
  (local $c i32) (local $n i32) (local $result i32)
  (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const -1))))
  (local.set $c (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
  (if (i32.and (i32.eq (local.get $c) (i32.const 36)) (i32.lt_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end))) (then
    (local.set $n (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 1)))))
    (if (i32.eq (local.get $n) (i32.const 40)) (then
      (if (i32.lt_u (i32.add (local.get $pos) (i32.const 2)) (local.get $end)) (then
        (if (i32.eq (i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const 2)))) (i32.const 40)) (then
          (local.set $result (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 3)) (local.get $end) (i32.const 2) (i32.const 2)))
          (if (i32.ge_s (local.get $result) (i32.const 0)) (then (return (local.get $result))))))))
      (return (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 2)) (local.get $end) (i32.const 0) (i32.const 2)))))
    (if (i32.eq (local.get $n) (i32.const 123)) (then
      (return (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 2)) (local.get $end) (i32.const 1) (i32.const 2)))))))
  (if (i32.eq (local.get $c) (i32.const 96)) (then
    (return (call $groupBody (local.get $input) (i32.add (local.get $pos) (i32.const 1)) (local.get $end) (i32.const 3) (i32.const 2)))))
  (i32.const -1))`;

export function lowerGroup(
  m: Extract<Matcher, { kind: "group" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  return `(local.set $p (call $group (local.get $input) (local.get $p) (local.get $limit)))
          (br_if ${fail} (i32.lt_s (local.get $p) (i32.const 0)))`;
}
