import { func, wat } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

const charCode = (character: string) => character.charCodeAt(0);

export function angleAutolink(ranges: ReturnType<typeof logicalRanges>) {
  const maxSchemeLength = 32;
  const maxDomainLabelLength = 63;
  const asciiCaseBit = 0x20;
  const byteInRange = (first: string, last: string) => {
    const start = charCode(first);
    const width = charCode(last) - start;
    return wat`(i32.le_u (i32.sub (local.get $byte) (i32.const ${start})) (i32.const ${width}))`;
  };
  const hashThroughApostrophe = byteInRange("#", "'");
  const starOrPlus = byteInRange("*", "+");
  const hyphenThroughSlash = byteInRange("-", "/");
  const caretThroughBacktick = byteInRange("^", "`");
  const braceThroughTilde = byteInRange("{", "~");
  const deleteByte = 0x7f;
  const letterSpan = charCode("z") - charCode("a");
  const digitSpan = charCode("9") - charCode("0");
  const isAsciiLetter = wat`(i32.le_u
    (i32.sub (i32.or (local.get $byte) (i32.const ${asciiCaseBit})) (i32.const ${charCode("a")}))
    (i32.const ${letterSpan}))`;
  const isAsciiDigit = wat`(i32.le_u
    (i32.sub (local.get $byte) (i32.const ${charCode("0")})) (i32.const ${digitSpan}))`;
  return func(
    "angleAutolink",
    () => wat`
      (param $input i32) (param $start i64) (param $limit i32) (result i64)
      (local $cursor i64) (local $next i64) (local $byte i32) (local $length i32) (local $last i32)
      (local.set $cursor (call ${ranges.advance} (local.get $start) (local.get $limit)))
      (local.set $next (local.get $cursor))
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
      (if
        ${isAsciiLetter}
        (then
          (block $schemeDone (loop $scheme
            (br_if $schemeDone (i32.eq (local.get $byte) (i32.const ${charCode(":")})))
            (br_if $schemeDone
              (i32.eqz
                (i32.or
                  ${isAsciiLetter}
                  (i32.or
                    ${isAsciiDigit}
                    (i32.or
                      (i32.eq (local.get $byte) (i32.const ${charCode("+")}))
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const ${charCode("-")}))
                        (i32.eq (local.get $byte) (i32.const ${charCode(".")}))))))))
            (local.set $length (i32.add (local.get $length) (i32.const 1)))
            (br_if $schemeDone (i32.gt_u (local.get $length) (i32.const ${maxSchemeLength})))
            (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
            (local.set $byte
              (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
            (br $scheme)))
          (if
            (i32.and
              (i32.eq (local.get $byte) (i32.const ${charCode(":")}))
              (i32.and
                (i32.ge_u (local.get $length) (i32.const 2))
                (i32.le_u (local.get $length) (i32.const ${maxSchemeLength}))))
            (then
              (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
              (block $invalidUri (loop $uri
                (local.set $byte
                  (call ${ranges.peek} (local.get $input) (local.get $next) (local.get $limit)))
                (if (i32.eq (local.get $byte) (i32.const ${charCode(">")}))
                  (then (return (call ${ranges.advance} (local.get $next) (local.get $limit)))))
                (br_if $invalidUri
                  (i32.or
                    (i32.eq (local.get $byte) (i32.const -1))
                    (i32.or
                      (i32.le_u (local.get $byte) (i32.const ${charCode(" ")}))
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const ${deleteByte}))
                        (i32.eq (local.get $byte) (i32.const ${charCode("<")}))))))
                (local.set $next (call ${ranges.advance} (local.get $next) (local.get $limit)))
                (br $uri)))))))
      (local.set $length (i32.const 0))
      (block $localDone (loop $local
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $localDone (i32.eq (local.get $byte) (i32.const ${charCode("@")})))
        (if
          (i32.eqz
            (i32.or
              ${isAsciiLetter}
              (i32.or
                ${isAsciiDigit}
                (i32.or
                  (i32.eq (local.get $byte) (i32.const ${charCode("!")}))
                  (i32.or
                    ${hashThroughApostrophe}
                    (i32.or
                      ${starOrPlus}
                      (i32.or
                        ${hyphenThroughSlash}
                        (i32.or
                          (i32.eq (local.get $byte) (i32.const ${charCode("=")}))
                          (i32.or
                            (i32.eq (local.get $byte) (i32.const ${charCode("?")}))
                            (i32.or
                              ${caretThroughBacktick}
                              ${braceThroughTilde}))))))))))
          (then (return (i64.const -1))))
        (local.set $length (i32.add (local.get $length) (i32.const 1)))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $local)))
      (if (i32.eqz (local.get $length)) (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $length (i32.const 0))
      (loop $domain
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if
          (i32.or
            (i32.eq (local.get $byte) (i32.const ${charCode(".")}))
            (i32.eq (local.get $byte) (i32.const ${charCode(">")})))
          (then
            (if (i32.or (i32.eqz (local.get $length)) (i32.eq (local.get $last) (i32.const ${charCode("-")})))
              (then (return (i64.const -1))))
            (if (i32.eq (local.get $byte) (i32.const ${charCode(">")}))
              (then (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
            (local.set $length (i32.const 0)))
          (else
            (if
              (i32.eqz
                (i32.or
                  ${isAsciiLetter}
                  (i32.or
                    ${isAsciiDigit}
                    (i32.and
                      (i32.eq (local.get $byte) (i32.const ${charCode("-")}))
                      (i32.ne (local.get $length) (i32.const 0))))))
              (then (return (i64.const -1))))
            (local.set $length (i32.add (local.get $length) (i32.const 1)))
            (if (i32.gt_u (local.get $length) (i32.const ${maxDomainLabelLength})) (then (return (i64.const -1))))))
        (local.set $last (local.get $byte))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $domain))
      (i64.const -1)`,
  );
}
