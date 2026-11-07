import { bytes, data, func, global, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
import { punctuationRanges } from "./unicode_punctuation.ts";

const packedRanges = punctuationRanges.flatMap(([first, last]) => {
  const ranges: [number, number][] = [];
  while (first <= last) {
    const end = Math.min(first + 255, last);
    ranges.push([first, end - first]);
    first = end + 1;
  }
  return ranges;
});
export const punctuationBytes = packedRanges.length * 4;

export function unicodePunctuation(tableAddress: Fragment) {
  const encoded = new Uint8Array(punctuationBytes);
  const view = new DataView(encoded.buffer);
  packedRanges.forEach(([first, length], index) => {
    view.setUint32(index * 4, (first | (length << 24)) >>> 0, true);
  });
  const table = data("unicodePunctuationTable", () => wat`${bytes(encoded)}`);
  const ready = global("unicodePunctuationReady", () => wat`(mut i32) (i32.const 0)`);
  return func(
    "unicodePunctuation",
    () => wat`
    (param $codepoint i32) (result i32)
    (local $low i32) (local $high i32) (local $mid i32) (local $entry i32) (local $first i32)
    (if (i32.lt_u (local.get $codepoint) (i32.const 128)) (then
      (return (i32.or (i32.le_u (i32.sub (local.get $codepoint) (i32.const 33)) (i32.const 14))
        (i32.or (i32.le_u (i32.sub (local.get $codepoint) (i32.const 58)) (i32.const 6))
          (i32.or (i32.le_u (i32.sub (local.get $codepoint) (i32.const 91)) (i32.const 5))
            (i32.le_u (i32.sub (local.get $codepoint) (i32.const 123)) (i32.const 3))))))))
    (if (i32.eqz (global.get ${ready})) (then
      (memory.init ${table} ${tableAddress} (i32.const 0) (i32.const ${punctuationBytes}))
      (global.set ${ready} (i32.const 1))))
    (local.set $high (i32.const ${packedRanges.length}))
    (block $done (loop $search
      (br_if $done (i32.ge_u (local.get $low) (local.get $high)))
      (local.set $mid (i32.shr_u (i32.add (local.get $low) (local.get $high)) (i32.const 1)))
      (local.set $entry (i32.load (i32.add ${tableAddress} (i32.shl (local.get $mid) (i32.const 2)))))
      (local.set $first (i32.and (local.get $entry) (i32.const 16777215)))
      (if (i32.lt_u (local.get $codepoint) (local.get $first))
        (then (local.set $high (local.get $mid)))
        (else (if (i32.le_u (i32.sub (local.get $codepoint) (local.get $first)) (i32.shr_u (local.get $entry) (i32.const 24)))
          (then (return (i32.const 1))) (else (local.set $low (i32.add (local.get $mid) (i32.const 1)))))))
      (br $search)))
    (i32.const 0)`,
  );
}

export function delimiterFlanking(punctuation: Def, whitespace: Def) {
  return func(
    "delimiterFlanking",
    () => wat`
    (param $before i32) (param $after i32) (param $marker i32) (result i32)
    (local $beforeSpace i32) (local $afterSpace i32) (local $beforePunctuation i32) (local $afterPunctuation i32)
    (local $left i32) (local $right i32) (local $open i32) (local $close i32)
    (local.set $beforeSpace (i32.or (i32.eq (local.get $before) (i32.const -1)) (call ${whitespace} (local.get $before))))
    (local.set $afterSpace (i32.or (i32.eq (local.get $after) (i32.const -1)) (call ${whitespace} (local.get $after))))
    (local.set $beforePunctuation (call ${punctuation} (local.get $before)))
    (local.set $afterPunctuation (call ${punctuation} (local.get $after)))
    (local.set $left (i32.and (i32.eqz (local.get $afterSpace))
      (i32.or (i32.eqz (local.get $afterPunctuation)) (i32.or (local.get $beforeSpace) (local.get $beforePunctuation)))))
    (local.set $right (i32.and (i32.eqz (local.get $beforeSpace))
      (i32.or (i32.eqz (local.get $beforePunctuation)) (i32.or (local.get $afterSpace) (local.get $afterPunctuation)))))
    (local.set $open (local.get $left)) (local.set $close (local.get $right))
    (if (i32.eq (local.get $marker) (i32.const 95)) (then
      (local.set $open (i32.and (local.get $left) (i32.or (i32.eqz (local.get $right)) (local.get $beforePunctuation))))
      (local.set $close (i32.and (local.get $right) (i32.or (i32.eqz (local.get $left)) (local.get $afterPunctuation))))))
    (i32.or (local.get $open) (i32.shl (local.get $close) (i32.const 1)))`,
  );
}

export function delimiterMatch() {
  return func(
    "delimiterMatch",
    () => wat`
    (param $openerLength i32) (param $closerLength i32) (param $openerCloses i32) (param $closerOpens i32) (result i32)
    (i32.eqz (i32.and (i32.or (local.get $openerCloses) (local.get $closerOpens))
      (i32.and (i32.eqz (i32.rem_u (i32.add (i32.rem_u (local.get $openerLength) (i32.const 3))
        (i32.rem_u (local.get $closerLength) (i32.const 3))) (i32.const 3)))
        (i32.or (i32.ne (i32.rem_u (local.get $openerLength) (i32.const 3)) (i32.const 0))
          (i32.ne (i32.rem_u (local.get $closerLength) (i32.const 3)) (i32.const 0))))))`,
  );
}

export function unicodeWhitespace() {
  return func(
    "unicodeWhitespace",
    () => wat`
    (param $codepoint i32) (result i32)
    (i32.or (i32.eq (local.get $codepoint) (i32.const 32))
      (i32.or (i32.eq (local.get $codepoint) (i32.const 9))
        (i32.or (i32.eq (local.get $codepoint) (i32.const 10))
          (i32.or (i32.eq (local.get $codepoint) (i32.const 12))
            (i32.or (i32.eq (local.get $codepoint) (i32.const 13))
              (i32.or (i32.eq (local.get $codepoint) (i32.const 160))
                (i32.or (i32.eq (local.get $codepoint) (i32.const 5760))
                  (i32.or (i32.le_u (i32.sub (local.get $codepoint) (i32.const 8192)) (i32.const 10))
                    (i32.or (i32.eq (local.get $codepoint) (i32.const 8239))
                      (i32.or (i32.eq (local.get $codepoint) (i32.const 8287))
                        (i32.eq (local.get $codepoint) (i32.const 12288))))))))))))`,
  );
}
