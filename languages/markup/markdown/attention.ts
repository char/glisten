import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { delimiterResolver } from "./delimiters.ts";
import { inlineAtoms } from "./inline_atoms.ts";
import { ends, event, get, match, run } from "./layout.ts";
import { logicalRanges } from "./logical.ts";
import { paragraphScratch } from "./scratch.ts";
import {
  delimiterFlanking,
  delimiterMatch,
  unicodePunctuation,
  unicodeWhitespace,
} from "./unicode.ts";
import { logicalUtf8 } from "./utf8.ts";
import { kind } from "./styles.ts";

export function attention(
  ranges: ReturnType<typeof logicalRanges>,
  scratch: ReturnType<typeof paragraphScratch>,
  inline: ReturnType<typeof inlineAtoms>,
  charge: Def,
) {
  const unicode = logicalUtf8(ranges, scratch.address, charge);
  const flanking = delimiterFlanking(
    unicodePunctuation(wat`(i32.add (global.get $base) (i32.const 544))`),
    unicodeWhitespace(),
  );
  const resolve = delimiterResolver(charge, delimiterMatch());
  const first = global("attentionFirst", () => wat`(mut i32) (i32.const 0)`);
  const nodes = global("attentionNodes", () => wat`(mut i32) (i32.const 0)`);
  const pairs = global("attentionPairs", () => wat`(mut i32) (i32.const 0)`);
  const heads = global("attentionHeads", () => wat`(mut i32) (i32.const 0)`);
  const inScratch = (offset: string) =>
    wat`(i32.add (global.get ${scratch.address}) ${get(offset)})`;
  const build = func(
    "buildAttention",
    () => wat`
    (param $input i32) (param $start i64) (param $limit i32) (param $out i32) (param $firstStart i64)
    (local $cursor i64) (local $eventStart i64) (local $eventEnd i64) (local $eventStyle i32)
    (local $event i32) (local $last i32) (local $address i32) (local $count i32) (local $bytes i64)
    (local $marker i32) (local $length i32) (local $maxLength i64) (local $maxPairs i64) (local $node i32) (local $flags i32)
    (local $area i32) (local $bottoms i32) (local $matches i32) (local $pair i32) (local $i i32)
    (local $openHead i32) (local $closeHead i32) (local $tail i32)
    (local.set $eventStart (local.get $firstStart))
    (local.set $eventEnd (global.get ${inline.end}))
    (local.set $eventStyle (global.get ${inline.style}))
    (block $collected (loop $collect
      (local.set $event (call ${scratch.reserve} (i64.const ${event.size}) (local.get $out)))
      (call ${charge} (i64.const ${event.size}))
      (if (local.get $last) (then
        ${event.set(inScratch("last"), "next", get("event"))})
        (else (global.set ${first} (local.get $event))))
      (local.set $address ${inScratch("event")})
      ${event.set(get("address"), "next", wat`(i32.const 0)`)}
      ${event.set(get("address"), "style", get("eventStyle"))}
      ${event.set(get("address"), "start", get("eventStart"))}
      ${event.set(get("address"), "end", get("eventEnd"))}
      (if (i32.eq (local.get $eventStyle) (i32.const ${kind.delimiterRun})) (then
        (local.set $length (i32.sub (i32.wrap_i64 (local.get $eventEnd)) (i32.wrap_i64 (local.get $eventStart))))
        (local.set $bytes (i64.add (local.get $bytes) (i64.extend_i32_u (local.get $length))))
        (if (i64.gt_u (i64.extend_i32_u (local.get $length)) (local.get $maxLength)) (then
          (local.set $maxLength (i64.extend_i32_u (local.get $length)))))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))))
      (local.set $last (local.get $event))
      (local.set $cursor (local.get $eventEnd))
      (local.set $eventStart (call ${inline.parse} (local.get $input) (local.get $cursor) (local.get $limit) (local.get $out)))
      (br_if $collected (i64.eq (local.get $eventStart) (i64.const -1)))
      (local.set $eventEnd (global.get ${inline.end})) (local.set $eventStyle (global.get ${inline.style}))
      (br $collect)))
    ;; Every match consumes a byte outside the largest run.
    (local.set $maxPairs (i64.shr_u (local.get $bytes) (i64.const 1)))
    (if (i64.lt_u (i64.sub (local.get $bytes) (local.get $maxLength)) (local.get $maxPairs)) (then
      (local.set $maxPairs (i64.sub (local.get $bytes) (local.get $maxLength)))))
    (local.set $area (call ${scratch.reserve} (i64.add (i64.const 56)
      (i64.add (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${run.size + ends.size}))
        (i64.mul (local.get $maxPairs) (i64.const ${match.size})))) (local.get $out)))
    (local.set $bottoms (local.get $area))
    (global.set ${nodes} (i32.add (local.get $area) (i32.const 56)))
    (global.set ${heads} (i32.add (global.get ${nodes}) (i32.mul (local.get $count) (i32.const ${run.size}))))
    (global.set ${pairs} (i32.add (global.get ${heads}) (i32.mul (local.get $count) (i32.const ${ends.size}))))
    (call ${charge} (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${ends.size})))
    (memory.fill (i32.add (global.get ${scratch.address}) (global.get ${heads})) (i32.const 255) (i32.mul (local.get $count) (i32.const ${ends.size})))
    (local.set $event (global.get ${first}))
    (block $nodesDone (loop $makeNodes
      (br_if $nodesDone (i32.eqz (local.get $event)))
      (local.set $address ${inScratch("event")})
      (if (i32.eq ${event.get(get("address"), "style")} (i32.const ${kind.delimiterRun})) (then
        (local.set $eventStart ${event.get(get("address"), "start")})
        (local.set $eventEnd ${event.get(get("address"), "end")})
        (local.set $length (i32.sub (i32.wrap_i64 (local.get $eventEnd)) (i32.wrap_i64 (local.get $eventStart))))
        (local.set $marker (call ${ranges.peek} (local.get $input) (local.get $eventStart) (local.get $limit)))
        (local.set $flags (call ${flanking}
          (call ${unicode.before} (local.get $input) (local.get $eventStart) (local.get $start) (local.get $limit))
          (call ${unicode.decode} (local.get $input) (local.get $eventEnd) (local.get $limit)) (local.get $marker)))
        (if (i32.and (i32.eq (local.get $marker) (i32.const 126)) (i32.gt_u (local.get $length) (i32.const 2))) (then
          (local.set $flags (i32.const 0))))
        (local.set $node (i32.add (global.get ${scratch.address}) ${run.at(wat`(global.get ${nodes})`, get("i"))}))
        ${run.set(get("node"), "position", wat`(i32.wrap_i64 (local.get $eventStart))`)}
        ${run.set(get("node"), "length", get("length"))}
        ${run.set(get("node"), "marker", get("marker"))}
        ${run.set(get("node"), "flags", get("flags"))}
        ${event.set(get("address"), "run", get("i"))}
        (local.set $i (i32.add (local.get $i) (i32.const 1)))))
      (local.set $event ${event.get(get("address"), "next")}) (br $makeNodes)))
    (local.set $matches (call ${resolve} (i32.add (global.get ${scratch.address}) (global.get ${nodes})) (local.get $count)
      (i32.add (global.get ${scratch.address}) (local.get $bottoms)) (i32.add (global.get ${scratch.address}) (global.get ${pairs}))))
    (local.set $i (i32.const 0))
    (block $linked (loop $link
      (br_if $linked (i32.ge_u (local.get $i) (local.get $matches)))
      (call ${charge} (i64.const 1))
      (local.set $pair (i32.add (global.get ${scratch.address}) ${match.at(wat`(global.get ${pairs})`, get("i"))}))
      (local.set $openHead (i32.add (global.get ${scratch.address}) ${ends.at(wat`(global.get ${heads})`, match.get(get("pair"), "opener"))}))
      (local.set $closeHead (i32.add (global.get ${scratch.address}) ${ends.at(wat`(global.get ${heads})`, match.get(get("pair"), "closer"))}))
      ${match.set(get("pair"), "nextOpening", ends.get(get("openHead"), "opens"))}
      ${ends.set(get("openHead"), "opens", get("i"))}
      ${match.set(get("pair"), "nextClosing", wat`(i32.const -1)`)}
      (local.set $tail ${ends.get(get("closeHead"), "lastClose")})
      (if (i32.eq (local.get $tail) (i32.const -1))
        (then ${ends.set(get("closeHead"), "closes", get("i"))})
        (else ${match.set(wat`(i32.add (global.get ${scratch.address}) ${match.at(wat`(global.get ${pairs})`, get("tail"))})`, "nextClosing", get("i"))}))
      ${ends.set(get("closeHead"), "lastClose", get("i"))}
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $link)))`,
  );
  return { build, first, nodes, pairs, heads };
}
