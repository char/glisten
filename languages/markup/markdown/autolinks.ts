import { func, wat } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

export function angleAutolink(ranges: ReturnType<typeof logicalRanges>) {
  return func(
    "angleAutolink",
    () => wat`
    (param $input i32) (param $start i64) (param $limit i32) (result i64)
    (local $cursor i64) (local $next i64) (local $byte i32) (local $length i32) (local $last i32)
    (local.set $cursor (call ${ranges.advance} (local.get $start) (local.get $limit)))
    (local.set $next (local.get $cursor))
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
    (if (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 25)) (then
      (block $schemeDone (loop $scheme
        (br_if $schemeDone (i32.eq (local.get $byte) (i32.const 58)))
        (br_if $schemeDone (i32.eqz (i32.or
          (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 25))
          (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9))
            (i32.or (i32.eq (local.get $byte) (i32.const 43))
              (i32.or (i32.eq (local.get $byte) (i32.const 45)) (i32.eq (local.get $byte) (i32.const 46))))))))
        (local.set $length (i32.add (local.get $length) (i32.const 1)))
        (br_if $schemeDone (i32.gt_u (local.get $length) (i32.const 32)))
        (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
        (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit))) (br $scheme)))
      (if (i32.and (i32.eq (local.get $byte) (i32.const 58)) (i32.and (i32.ge_u (local.get $length) (i32.const 2)) (i32.le_u (local.get $length) (i32.const 32)))) (then
        (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
        (block $invalidUri (loop $uri
          (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
          (if (i32.eq (local.get $byte) (i32.const 62)) (then
            (return (call ${ranges.advance} (local.get $next) (local.get $limit)))))
          (br_if $invalidUri (i32.or (i32.eq (local.get $byte) (i32.const -1))
            (i32.or (i32.le_u (local.get $byte) (i32.const 32))
              (i32.or (i32.eq (local.get $byte) (i32.const 127)) (i32.eq (local.get $byte) (i32.const 60))))))
          (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit))) (br $uri)))))))
    (local.set $length (i32.const 0))
    (block $localDone (loop $local
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $localDone (i32.eq (local.get $byte) (i32.const 64)))
      (if (i32.eqz (i32.or (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 25))
        (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9))
          (i32.or (i32.eq (local.get $byte) (i32.const 33))
            (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 35)) (i32.const 4))
              (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 42)) (i32.const 1))
                (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 45)) (i32.const 2))
                  (i32.or (i32.eq (local.get $byte) (i32.const 61))
                    (i32.or (i32.eq (local.get $byte) (i32.const 63))
                      (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 94)) (i32.const 2))
                        (i32.le_u (i32.sub (local.get $byte) (i32.const 123)) (i32.const 3))))))))))))
        (then (return (i64.const -1))))
      (local.set $length (i32.add (local.get $length) (i32.const 1)))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $local)))
    (if (i32.eqz (local.get $length)) (then (return (i64.const -1))))
    (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
    (local.set $length (i32.const 0))
    (loop $domain
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.or (i32.eq (local.get $byte) (i32.const 46)) (i32.eq (local.get $byte) (i32.const 62))) (then
        (if (i32.or (i32.eqz (local.get $length)) (i32.eq (local.get $last) (i32.const 45))) (then (return (i64.const -1))))
        (if (i32.eq (local.get $byte) (i32.const 62)) (then
          (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
        (local.set $length (i32.const 0)))
        (else
          (if (i32.eqz (i32.or (i32.le_u (i32.sub (i32.or (local.get $byte) (i32.const 32)) (i32.const 97)) (i32.const 25))
            (i32.or (i32.le_u (i32.sub (local.get $byte) (i32.const 48)) (i32.const 9))
              (i32.and (i32.eq (local.get $byte) (i32.const 45)) (i32.ne (local.get $length) (i32.const 0))))))
            (then (return (i64.const -1))))
          (local.set $length (i32.add (local.get $length) (i32.const 1)))
          (if (i32.gt_u (local.get $length) (i32.const 63)) (then (return (i64.const -1))))))
      (local.set $last (local.get $byte))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit))) (br $domain))
    (i64.const -1)`,
  );
}
