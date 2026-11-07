import { func, global, wat } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

export function referenceDefinition(ranges: ReturnType<typeof logicalRanges>) {
  const label = referenceLabel(ranges),
    destination = referenceDestination(ranges),
    title = referenceTitle(ranges);
  const labelStart = global("referenceLabelStart", () => wat`(mut i64) (i64.const 0)`);
  const destinationStart = global("referenceDestinationStart", () => wat`(mut i64) (i64.const 0)`);
  const destinationEnd = global("referenceDestinationEnd", () => wat`(mut i64) (i64.const 0)`);
  const titleStart = global("referenceTitleStart", () => wat`(mut i64) (i64.const -1)`);
  const titleEnd = global("referenceTitleEnd", () => wat`(mut i64) (i64.const -1)`);
  const spaces = func(
    "referenceSpaces",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $byte i32)
    (block $done (loop $more
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $done (i32.and (i32.ne (local.get $byte) (i32.const 32)) (i32.ne (local.get $byte) (i32.const 9))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $more)))
    (local.get $cursor)`,
  );
  const lineEnd = func(
    "referenceLineEnd",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $byte i32)
    (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.eq (local.get $byte) (i32.const 13)) (then
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.eq (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 10))
        (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (return (local.get $cursor))))
    (if (i32.eq (local.get $byte) (i32.const 10)) (then
      (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
    (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (local.get $cursor))))
    (i64.const -1)`,
  );
  const parse = func(
    "referenceDefinition",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $start i64) (local $next i64) (local $afterLine i64) (local $byte i32) (local $indent i32)
    (global.set ${titleStart} (i64.const -1)) (global.set ${titleEnd} (i64.const -1))
    (block $indented (loop $indentLoop
      (br_if $indented (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 32)))
      (local.set $indent (i32.add (local.get $indent) (i32.const 1)))
      (if (i32.gt_u (local.get $indent) (i32.const 3)) (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $indentLoop)))
    (global.set ${labelStart} (local.get $cursor))
    (local.set $cursor (call ${label} (local.get $input) (local.get $cursor) (local.get $limit) (i32.const 1)))
    (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
    (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.or (i32.eq (local.get $byte) (i32.const 13)) (i32.eq (local.get $byte) (i32.const 10))) (then
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.and (i32.eq (local.get $byte) (i32.const 13))
        (i32.eq (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 10)))
        (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))))
    (global.set ${destinationStart} (local.get $cursor))
    (local.set $cursor (call ${destination} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
    (global.set ${destinationEnd} (local.get $cursor))
    (local.set $start (local.get $cursor))
    (local.set $next (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
    (local.set $afterLine (call ${lineEnd} (local.get $input) (local.get $next) (local.get $limit)))
    (if (i64.eq (local.get $afterLine) (i64.const -1)) (then
      (if (i64.eq (local.get $start) (local.get $next)) (then (return (i64.const -1))))
      (global.set ${titleStart} (local.get $next))
      (local.set $cursor (call ${title} (local.get $input) (local.get $next) (local.get $limit)))
      (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
      (global.set ${titleEnd} (local.get $cursor))
      (return (call ${lineEnd} (local.get $input) (local.get $cursor) (local.get $limit)))))
    (if (i64.eq (local.get $afterLine) (local.get $next)) (then (return (local.get $afterLine))))
    (local.set $next (call ${spaces} (local.get $input) (local.get $afterLine) (local.get $limit)))
    (local.set $cursor (call ${title} (local.get $input) (local.get $next) (local.get $limit)))
    (if (i64.ne (local.get $cursor) (i64.const -1)) (then
      (local.set $start (call ${lineEnd} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i64.ne (local.get $start) (i64.const -1)) (then
        (global.set ${titleStart} (local.get $next)) (global.set ${titleEnd} (local.get $cursor))
        (return (local.get $start))))))
    (local.get $afterLine)`,
  );
  return {
    parse,
    label,
    destination,
    title,
    labelStart,
    destinationStart,
    destinationEnd,
    titleStart,
    titleEnd,
  };
}

export function referenceDestination(ranges: ReturnType<typeof logicalRanges>) {
  return func(
    "referenceDestination",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $byte i32) (local $depth i32) (local $angle i32) (local $count i32)
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.eq (local.get $byte) (i32.const 60)) (then
      (local.set $angle (i32.const 1))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
    (block $done (loop $more
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (local.get $angle) (then
        (if (i32.or (i32.eq (local.get $byte) (i32.const -1))
          (i32.or (i32.eq (local.get $byte) (i32.const 10))
            (i32.or (i32.eq (local.get $byte) (i32.const 13)) (i32.eq (local.get $byte) (i32.const 60)))))
          (then (return (i64.const -1))))
        (if (i32.eq (local.get $byte) (i32.const 62)) (then
          (return (call ${ranges.advance} (local.get $cursor) (local.get $limit))))))
        (else
          (br_if $done (i32.or (i32.eq (local.get $byte) (i32.const -1))
            (i32.or (i32.le_u (local.get $byte) (i32.const 32)) (i32.eq (local.get $byte) (i32.const 127)))))
          (if (i32.eq (local.get $byte) (i32.const 40)) (then
            (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
            (if (i32.gt_u (local.get $depth) (i32.const 32)) (then (return (i64.const -1))))))
          (if (i32.eq (local.get $byte) (i32.const 41)) (then
            (br_if $done (i32.eqz (local.get $depth)))
            (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))))))
      (local.set $count (i32.add (local.get $count) (i32.const 1)))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const 92)) (then
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 33)) (i32.const 14))
          (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 58)) (i32.const 6))
            (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 91)) (i32.const 5))
              (i32.le_u (i32.sub (local.get $byte) (i32.const 123)) (i32.const 3))))) (then
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))))
      (br $more)))
    (if (i32.or (i32.eqz (local.get $count)) (local.get $depth)) (then (return (i64.const -1))))
    (local.get $cursor)`,
  );
}

export function referenceTitle(ranges: ReturnType<typeof logicalRanges>) {
  return func(
    "referenceTitle",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $open i32) (local $close i32) (local $byte i32) (local $afterBreak i32)
    (local.set $open (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.and (i32.ne (local.get $open) (i32.const 34))
      (i32.and (i32.ne (local.get $open) (i32.const 39)) (i32.ne (local.get $open) (i32.const 40))))
      (then (return (i64.const -1))))
    (local.set $close (if (result i32) (i32.eq (local.get $open) (i32.const 40))
      (then (i32.const 41)) (else (local.get $open))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (loop $more
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i64.const -1))))
      (if (i32.eq (local.get $byte) (local.get $close)) (then
        (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (if (i32.and (i32.eq (local.get $open) (i32.const 40)) (i32.eq (local.get $byte) (i32.const 40)))
        (then (return (i64.const -1))))
      (if (i32.or (i32.eq (local.get $byte) (i32.const 10)) (i32.eq (local.get $byte) (i32.const 13))) (then
        (if (local.get $afterBreak) (then (return (i64.const -1))))
        (local.set $afterBreak (i32.const 1)))
        (else (if (i32.and (i32.ne (local.get $byte) (i32.const 32))
          (i32.and (i32.ne (local.get $byte) (i32.const 9)) (i32.ne (local.get $byte) (i32.const 13))))
          (then (local.set $afterBreak (i32.const 0))))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.and (i32.eq (local.get $byte) (i32.const 13))
        (i32.eq (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 10)))
        (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (if (i32.eq (local.get $byte) (i32.const 92)) (then
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.or (i32.eq (local.get $byte) (local.get $open))
          (i32.or (i32.eq (local.get $byte) (local.get $close)) (i32.eq (local.get $byte) (i32.const 92))))
          (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))))
      (br $more))
    (i64.const -1)`,
  );
}

export function referenceLabel(ranges: ReturnType<typeof logicalRanges>) {
  const space = func(
    "referenceUnicodeSpace",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
    (local $first i32) (local $second i32) (local $third i32)
    (local.set $first (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.or (i32.eq (local.get $first) (i32.const 32))
      (i32.or (i32.eq (local.get $first) (i32.const 9)) (i32.or (i32.eq (local.get $first) (i32.const 10))
        (i32.or (i32.eq (local.get $first) (i32.const 12)) (i32.eq (local.get $first) (i32.const 13))))))
      (then (return (i32.const 1))))
    (if (i32.and (i32.ne (local.get $first) (i32.const 194))
      (i32.and (i32.ne (local.get $first) (i32.const 225))
        (i32.and (i32.ne (local.get $first) (i32.const 226)) (i32.ne (local.get $first) (i32.const 227)))))
      (then (return (i32.const 0))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (local.set $second (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.eq (local.get $first) (i32.const 194)) (then (return (i32.eq (local.get $second) (i32.const 160)))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (local.set $third (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (i32.or (i32.and (i32.eq (local.get $first) (i32.const 225))
      (i32.and (i32.eq (local.get $second) (i32.const 154)) (i32.eq (local.get $third) (i32.const 128))))
      (i32.or (i32.and (i32.eq (local.get $first) (i32.const 227))
        (i32.and (i32.eq (local.get $second) (i32.const 128)) (i32.eq (local.get $third) (i32.const 128))))
        (i32.and (i32.eq (local.get $first) (i32.const 226))
          (i32.or (i32.and (i32.eq (local.get $second) (i32.const 128))
            (i32.or (i32.le_u (i32.sub (local.get $third) (i32.const 128)) (i32.const 10)) (i32.eq (local.get $third) (i32.const 175))))
            (i32.and (i32.eq (local.get $second) (i32.const 129)) (i32.eq (local.get $third) (i32.const 159)))))))`,
  );
  return func(
    "referenceLabel",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (param $colon i32) (result i64)
    (local $byte i32) (local $count i32) (local $content i32) (local $afterBreak i32)
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 91))
      (then (return (i64.const -1))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (block $done (loop $more
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i64.const -1))))
      (if (i32.eq (local.get $byte) (i32.const 93)) (then (br $done)))
      (if (i32.eq (local.get $byte) (i32.const 91)) (then (return (i64.const -1))))
      (if (i32.ne (i32.and (local.get $byte) (i32.const 192)) (i32.const 128)) (then
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (if (i32.gt_u (local.get $count) (i32.const 999)) (then (return (i64.const -1))))))
      (if (i32.or (i32.eq (local.get $byte) (i32.const 10)) (i32.eq (local.get $byte) (i32.const 13))) (then
        (if (local.get $afterBreak) (then (return (i64.const -1))))
        (local.set $afterBreak (i32.const 1)))
        (else
          (if (i32.and (i32.ne (local.get $byte) (i32.const 32))
            (i32.and (i32.ne (local.get $byte) (i32.const 9)) (i32.ne (local.get $byte) (i32.const 13))))
            (then (local.set $afterBreak (i32.const 0))))
          (if (i32.and (i32.ne (i32.and (local.get $byte) (i32.const 192)) (i32.const 128))
            (i32.eqz (call ${space} (local.get $input) (local.get $cursor) (local.get $limit))))
            (then (local.set $content (i32.const 1))))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.and (i32.eq (local.get $byte) (i32.const 13))
        (i32.eq (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 10)))
        (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (if (i32.eq (local.get $byte) (i32.const 92)) (then
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.or (i32.eq (local.get $byte) (i32.const 91))
          (i32.or (i32.eq (local.get $byte) (i32.const 93)) (i32.eq (local.get $byte) (i32.const 92)))) (then
          (local.set $count (i32.add (local.get $count) (i32.const 1)))
          (if (i32.gt_u (local.get $count) (i32.const 999)) (then (return (i64.const -1))))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))))
      (br $more)))
    (if (i32.eqz (local.get $content)) (then (return (i64.const -1))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (if (i32.eqz (local.get $colon)) (then (return (local.get $cursor))))
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 58))
      (then (return (i64.const -1))))
    (call ${ranges.advance} (local.get $cursor) (local.get $limit))`,
  );
}
