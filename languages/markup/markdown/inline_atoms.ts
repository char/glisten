import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { inlineScan } from "./inline_scan.ts";
import { logicalRanges } from "./logical.ts";
import { paragraphScratch } from "./scratch.ts";
import { backtickIndex } from "./backticks.ts";
import { angleAutolink } from "./autolinks.ts";
import { kind, styled } from "./styles.ts";

export function inlineAtoms(
  ranges: ReturnType<typeof logicalRanges>,
  scratch: ReturnType<typeof paragraphScratch>,
  charge: Def,
) {
  const scan = inlineScan(ranges, scratch.address, charge, "&*<\\_`~");
  const autolink = angleAutolink(ranges);
  const index = backtickIndex(ranges, scratch, scan, charge);
  const end = global("inlineEnd", () => wat`(mut i64) (i64.const 0)`);
  const style = global("inlineStyle", () => wat`(mut i32) (i32.const 0)`);
  const parse = func(
    "inlineAtoms",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (param $out i32) (result i64)
    (local $start i64) (local $next i64) (local $look i64)
    (local $byte i32) (local $count i32) (local $length i32) (local $kind i32)
    (block $done (loop $more
      (local.set $cursor (call ${scan} (local.get $input) (local.get $cursor) (local.get $limit)))
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $done (i32.eq (local.get $byte) (i32.const -1)))
      (local.set $start (local.get $cursor))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const 60)) (then
        (local.set $look (call ${autolink} (local.get $input) (local.get $start) (local.get $limit)))
        (if (i64.ne (local.get $look) (i64.const -1)) (then
          (global.set ${end} (local.get $look))
          (global.set ${style} ${styled("text.uri")}) (return (local.get $start))))))
      (if (i32.or (i32.eq (local.get $byte) (i32.const 42))
        (i32.or (i32.eq (local.get $byte) (i32.const 95)) (i32.eq (local.get $byte) (i32.const 126)))) (then
        (block $runDone (loop $run
          (br_if $runDone (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (local.get $byte)))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $run)))
        (global.set ${end} (local.get $cursor))
        (global.set ${style} (i32.const ${kind.delimiterRun})) (return (local.get $start))))
      (if (i32.eq (local.get $byte) (i32.const 92)) (then
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 33)) (i32.const 14))
          (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 58)) (i32.const 6))
            (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 91)) (i32.const 5))
              (i32.le_u (i32.sub (local.get $byte) (i32.const 123)) (i32.const 3))))) (then
          (global.set ${end} (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (global.set ${style} ${styled("string.escape")}) (return (local.get $start))))))
      (if (i32.eq (local.get $byte) (i32.const 96)) (then
        (local.set $length (i32.const 1))
        (block $runDone (loop $run
          (br_if $runDone (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 96)))
          (local.set $length (i32.add (local.get $length) (i32.const 1)))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $run)))
        (if (i32.eqz (global.get ${index.ready})) (then
          (local.set $look (call ${index.near} (local.get $input) (local.get $cursor) (local.get $limit) (local.get $length)))
          (if (i64.ne (local.get $look) (i64.const 0)) (then
            (global.set ${end} (local.get $look))
            (global.set ${style} ${styled("text.literal")}) (return (local.get $start))))
          (call ${index.prepare} (local.get $input) (local.get $start) (local.get $limit) (local.get $out))))
        (local.set $look (call ${index.closer} (local.get $start)))
        (if (i64.ne (local.get $look) (i64.const 0)) (then
          (global.set ${end} (local.get $look))
          (global.set ${style} ${styled("text.literal")}) (return (local.get $start))))))
      (if (i32.eq (local.get $byte) (i32.const 38)) (then
        (local.set $next (local.get $cursor))
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
        (local.set $kind (i32.const 0)) (local.set $count (i32.const 0))
        (if (i32.eq (local.get $byte) (i32.const 35)) (then
          (local.set $kind (i32.const 1))
          (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
          (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
          (if (i32.eq (i32.or (local.get $byte) (i32.const 32)) (i32.const 120)) (then
            (local.set $kind (i32.const 2))
            (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))))))
        (block $digitsDone (loop $digits
          (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
          (if (i32.eqz (local.get $kind)) (then
            (br_if $digitsDone (i32.eqz (i32.or (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 25))
              (i32.and (i32.ne (local.get $count) (i32.const 0)) (i32.le_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9)))))))
            (else
              (br_if $digitsDone (i32.eqz (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9))
                (i32.and (i32.eq (local.get $kind) (i32.const 2)) (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 5))))))))
          (local.set $count (i32.add (local.get $count) (i32.const 1)))
          (br_if $digitsDone (i32.gt_u (local.get $count) (if (result i32) (i32.eqz (local.get $kind)) (then (i32.const 32))
            (else (if (result i32) (i32.eq (local.get $kind) (i32.const 1)) (then (i32.const 7)) (else (i32.const 6)))))))
          (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit))) (br $digits)))
        (if (i32.and (i32.gt_u (local.get $count) (i32.const 0)) (i32.eq (local.get $byte) (i32.const 59))) (then
          (global.set ${end} (call ${ranges.advance} (local.get $next) (local.get $limit)))
          (global.set ${style} ${styled("string.escape")}) (return (local.get $start))))))
      (br $more)))
    (i64.const -1)`,
  );
  return { parse, end, style, ready: index.ready };
}
