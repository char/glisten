import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

const charCode = (character: string) => character.charCodeAt(0);

export function inlineResource(
  ranges: ReturnType<typeof logicalRanges>,
  destination: Def,
  title: Def,
) {
  const destinationStart = global("resourceDestinationStart", () => wat`(mut i64) (i64.const -1)`);
  const destinationEnd = global("resourceDestinationEnd", () => wat`(mut i64) (i64.const -1)`);
  const titleStart = global("resourceTitleStart", () => wat`(mut i64) (i64.const -1)`);
  const titleEnd = global("resourceTitleEnd", () => wat`(mut i64) (i64.const -1)`);
  const spaces = func(
    "resourceSpaces",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $byte i32)
      (block $done (loop $more
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $done
          (i32.and
            (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
            (i32.and
              (i32.ne (local.get $byte) (i32.const ${charCode("\t")}))
              (i32.and
                (i32.ne (local.get $byte) (i32.const ${charCode("\n")}))
                (i32.ne (local.get $byte) (i32.const ${charCode("\r")}))))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $more)))
      (local.get $cursor)`,
  );
  const parse = func(
    "inlineResource",
    () => wat`
      (param $input i32) (param $start i64) (param $limit i32) (result i64)
      (local $cursor i64) (local $next i64)
      (global.set ${destinationStart} (i64.const -1))
      (global.set ${destinationEnd} (i64.const -1))
      (global.set ${titleStart} (i64.const -1))
      (global.set ${titleEnd} (i64.const -1))
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $start) (local.get $limit))
          (i32.const ${charCode("(")}))
        (then (return (i64.const -1))))
      (local.set $cursor
        (call ${spaces}
          (local.get $input)
          (call ${ranges.advance} (local.get $start) (local.get $limit))
          (local.get $limit)))
      (if
        (i32.eq
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${charCode(")")}))
        (then (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (global.set ${destinationStart} (local.get $cursor))
      (local.set $cursor
        (call ${destination} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
      (global.set ${destinationEnd} (local.get $cursor))
      (local.set $next (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.eq
          (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit))
          (i32.const ${charCode(")")}))
        (then (return (call ${ranges.advance} (local.get $next) (local.get $limit)))))
      (if (i64.eq (local.get $next) (local.get $cursor)) (then (return (i64.const -1))))
      (global.set ${titleStart} (local.get $next))
      (local.set $cursor (call ${title} (local.get $input) (local.get $next) (local.get $limit)))
      (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
      (global.set ${titleEnd} (local.get $cursor))
      (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${charCode(")")}))
        (then (return (i64.const -1))))
      (call ${ranges.advance} (local.get $cursor) (local.get $limit))`,
  );
  return { parse, destinationStart, destinationEnd, titleStart, titleEnd };
}
