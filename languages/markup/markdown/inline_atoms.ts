import { func, global, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
import { inlineScan } from "./inline_scan.ts";
import { logicalRanges } from "./logical.ts";
import { paragraphScratch } from "./scratch.ts";
import { backtickIndex } from "./backticks.ts";
import { angleAutolink } from "./autolinks.ts";
import { inlineHtml } from "./inline_html.ts";
import { kind, styled } from "./styles.ts";
import { get, queued } from "./layout.ts";

export function inlineAtoms(
  ranges: ReturnType<typeof logicalRanges>,
  scratch: ReturnType<typeof paragraphScratch>,
  charge: Def,
) {
  const scan = inlineScan(ranges, scratch.address, charge, "!&*<[\\]_`~");
  const byte = (offset: number) =>
    wat`(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const ${offset}))))`;
  const lower = (offset: number) => wat`(i32.or ${byte(offset)} (i32.const 32))`;
  const word = (offset: number) =>
    wat`(i32.or (i32.load (i32.add (local.get $input) (i32.add (local.get $pos) (i32.const ${offset})))) (i32.const 0x20202020))`;
  // Also stops at "." after "www", ":" after "http"/"https", and "@" after atext: the
  // places where a literal autolink can be recognized by looking back.
  const next = inlineScan(
    ranges,
    scratch.address,
    charge,
    "!&*.:<@[\\]_`~",
    "inlineNext",
    wat`(if (result i32) (i32.eq ${byte(0)} (i32.const 46))
      (then (i32.and (i32.ge_u (local.get $pos) (i32.const 3))
        (i32.and (i32.eq ${lower(-3)} (i32.const 119))
          (i32.and (i32.eq ${lower(-2)} (i32.const 119)) (i32.eq ${lower(-1)} (i32.const 119))))))
      (else (if (result i32) (i32.eq ${byte(0)} (i32.const 58))
        (then (i32.and (i32.ge_u (local.get $pos) (i32.const 4))
          (i32.or (i32.eq ${word(-4)} (i32.const 0x70747468))
            (i32.and (i32.ge_u (local.get $pos) (i32.const 5))
              (i32.and (i32.eq ${lower(-1)} (i32.const 115)) (i32.eq ${word(-5)} (i32.const 0x70747468)))))))
        (else (if (result i32) (i32.eq ${byte(0)} (i32.const 64))
          (then (i32.and (i32.ge_u (local.get $pos) (i32.const 1))
            (i32.or (i32.le_u (i32.sub ${lower(-1)} (i32.const 97)) (i32.const 25))
              (i32.or (i32.le_u (i32.sub ${byte(-1)} (i32.const 43)) (i32.const 14)) (i32.eq ${byte(-1)} (i32.const 95))))))
          (else (i32.const 1)))))))`,
  );
  const autolink = angleAutolink(ranges);
  const html = inlineHtml(ranges, charge);
  const index = backtickIndex(ranges, scratch, scan, charge);
  const backticks = global("inlineBackticks", () => wat`(mut i32) (i32.const 0)`);
  const backtickCapacity = global("inlineBacktickCapacity", () => wat`(mut i32) (i32.const 0)`);
  const events = global("inlineEvents", () => wat`(mut i32) (i32.const 0)`);
  const runs = global("inlineRuns", () => wat`(mut i32) (i32.const 0)`);
  const heads = global("inlineHeads", () => wat`(mut i32) (i32.const 0)`);
  const matches = global("inlineMatches", () => wat`(mut i32) (i32.const 0)`);
  const brackets = global("inlineBrackets", () => wat`(mut i32) (i32.const 0)`);
  const stack = global("inlineStack", () => wat`(mut i32) (i32.const 0)`);
  const work = global("inlineWork", () => wat`(mut i32) (i32.const 0)`);
  const bottoms = global("inlineBottoms", () => wat`(mut i32) (i32.const 0)`);
  const links = global("inlineLinks", () => wat`(mut i32) (i32.const 0)`);
  const specialCount = global("inlineSpecialCount", () => wat`(mut i32) (i32.const 0)`);
  const delimiterCount = global("inlineDelimiterCount", () => wat`(mut i32) (i32.const 0)`);
  const openCount = global("inlineOpenCount", () => wat`(mut i32) (i32.const 0)`);
  const closeCount = global("inlineCloseCount", () => wat`(mut i32) (i32.const 0)`);
  const tickBytes = global("inlineTickBytes", () => wat`(mut i32) (i32.const 0)`);
  const tickRuns = global("inlineTickRuns", () => wat`(mut i32) (i32.const 0)`);
  const tickMax = global("inlineTickMax", () => wat`(mut i32) (i32.const 0)`);
  const special = "!&*.:<@[\\]_`~";
  // A byte-set mask from nibble tables, as in the runtime's stop scans.
  const low = Array(16).fill(0),
    high = Array(16).fill(0);
  for (const byte of [...special].map((char) => char.charCodeAt(0))) {
    low[byte & 15] |= 1 << (byte >> 4);
    high[byte >> 4] = 1 << (byte >> 4);
  }
  const lanes = (mask: Fragment) => wat`(i32.popcnt (i8x16.bitmask ${mask}))`;
  const equal = (char: string) =>
    wat`(i8x16.eq (local.get $chunk) (i8x16.splat (i32.const ${char.charCodeAt(0)})))`;
  const is = (char: string) => wat`(i32.eq (local.get $byte) (i32.const ${char.charCodeAt(0)}))`;
  const add = (counter: Def, amount: Fragment) =>
    wat`(global.set ${counter} (i32.add (global.get ${counter}) ${amount}))`;
  // Counts bound the workspace: every collected event, run, bracket and backtick run
  // consumes one of the counted bytes.
  const countRange = func(
    "countInlineRange",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32)
    (local $chunk v128) (local $byte i32)
    (call ${charge} (i64.extend_i32_u (i32.sub (local.get $end) (local.get $pos))))
    (block $wide (loop $chunks
      (br_if $wide (i32.gt_u (i32.add (local.get $pos) (i32.const 16)) (local.get $end)))
      (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $pos))))
      ${add(
        specialCount,
        lanes(wat`(i8x16.ne (v128.and
        (i8x16.swizzle (v128.const i8x16 ${low}) (v128.and (local.get $chunk) (i8x16.splat (i32.const 15))))
        (i8x16.swizzle (v128.const i8x16 ${high}) (v128.and (i16x8.shr_u (local.get $chunk) (i32.const 4)) (i8x16.splat (i32.const 15)))))
        (i8x16.splat (i32.const 0)))`),
      )}
      ${add(delimiterCount, lanes(wat`(v128.or (v128.or ${equal("*")} ${equal("_")}) ${equal("~")})`))}
      ${add(openCount, lanes(equal("[")))}
      ${add(closeCount, lanes(equal("]")))}
      ${add(tickBytes, lanes(equal("`")))}
      (local.set $pos (i32.add (local.get $pos) (i32.const 16)))
      (br $chunks)))
    (block $narrow (loop $bytes
      (br_if $narrow (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $byte (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      ${add(
        specialCount,
        [...special].map(is).reduce((a, b) => wat`(i32.or ${a} ${b})`),
      )}
      ${add(delimiterCount, wat`(i32.or (i32.or ${is("*")} ${is("_")}) ${is("~")})`)}
      ${add(openCount, is("["))}
      ${add(closeCount, is("]"))}
      ${add(tickBytes, is("`"))}
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (br $bytes)))`,
  );
  const countSpecial = func(
    "countInlineSpecial",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32)
    (local $index i32) (local $pos i32) (local $entry i32) (local $end i32) (local $style i32)
    (global.set ${specialCount} (i32.const 0)) (global.set ${delimiterCount} (i32.const 0))
    (global.set ${openCount} (i32.const 0)) (global.set ${closeCount} (i32.const 0))
    (global.set ${tickBytes} (i32.const 0))
    (local.set $index (i32.wrap_i64 (i64.shr_u (local.get $cursor) (i64.const 32))))
    (local.set $pos (i32.wrap_i64 (local.get $cursor)))
    (block $done (loop $ranges
      (br_if $done (i32.ge_u (local.get $index) (local.get $limit)))
      (local.set $entry (i32.add (global.get ${scratch.address}) (local.get $index)))
      (local.set $end ${queued.get(get("entry"), "end")})
      (local.set $style ${queued.get(get("entry"), "style")})
      (if (i32.and (i32.lt_u (local.get $pos) (local.get $end))
        (i32.and (i32.ne (local.get $style) ${styled("punctuation.special")}) (i32.ne (local.get $style) (i32.const ${kind.indent}))))
        (then (call ${countRange} (local.get $input) (local.get $pos) (local.get $end))))
      (local.set $pos (local.get $end))
      (local.set $index (i32.add (local.get $index) (i32.const ${queued.size})))
      (br $ranges)))
    ;; Backtick runs and the longest run are bounded by the backtick bytes.
    (global.set ${tickRuns} (global.get ${tickBytes}))
    (global.set ${tickMax} (global.get ${tickBytes}))`,
  );
  const end = global("inlineEnd", () => wat`(mut i64) (i64.const 0)`);
  const style = global("inlineStyle", () => wat`(mut i32) (i32.const 0)`);
  const parse = func(
    "inlineAtoms",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (param $out i32) (result i64)
    (local $start i64) (local $next i64) (local $look i64)
    (local $byte i32) (local $count i32) (local $length i32) (local $kind i32)
    (block $done
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $done (i32.eq (local.get $byte) (i32.const -1)))
      (local.set $start (local.get $cursor))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const 60)) (then
        (local.set $look (call ${autolink} (local.get $input) (local.get $start) (local.get $limit)))
        (if (i64.ne (local.get $look) (i64.const -1)) (then
          (global.set ${end} (local.get $look))
          (global.set ${style} ${styled("text.uri")}) (return (local.get $start))))
        (local.set $look (call ${html.parse} (local.get $input) (local.get $start) (local.get $limit)))
        (if (i64.ne (local.get $look) (i64.const -1)) (then
          (global.set ${end} (local.get $look))
          (global.set ${style} (i32.const ${kind.html})) (return (local.get $start))))))
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
          (call ${index.prepare} (local.get $input) (local.get $start) (local.get $limit)
            (global.get ${backticks}) (global.get ${backtickCapacity}))))
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
      (global.set ${end} (local.get $cursor)))
    (i64.const -1)`,
  );
  return {
    next,
    html,
    countSpecial,
    specialCount,
    delimiterCount,
    openCount,
    closeCount,
    tickBytes,
    tickRuns,
    tickMax,
    parse,
    end,
    style,
    ready: index.ready,
    backticks,
    backtickCapacity,
    events,
    runs,
    heads,
    matches,
    brackets,
    stack,
    work,
    bottoms,
    links,
  };
}
