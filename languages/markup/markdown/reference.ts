import { func, global, wat } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";

const charCode = (character: string) => character.charCodeAt(0);
const maxReferenceIndent = 3;
const maxDestinationDepth = 32;
const asciiDelete = 0x7f;
const maxLabelCodepoints = 999;
const utf8ContinuationMask = 0xc0;
const utf8ContinuationPrefix = 0x80;
const noBreakSpaceLead = 0xc2;
const noBreakSpaceSecond = 0xa0;
const oghamSpaceLead = 0xe1;
const oghamSpaceSecond = 0x9a;
const generalSpaceLead = 0xe2;
const ideographicSpaceLead = 0xe3;
const spaceBlockFirstByte = 0x80;
const spaceBlockLastByte = 0x8a;
const spaceBlockWidth = spaceBlockLastByte - spaceBlockFirstByte;
const narrowNoBreakSpaceLastByte = 0xaf;
const mathematicalSpaceSecondByte = 0x81;
const mathematicalSpaceLastByte = 0x9f;

export function referenceDefinition(ranges: ReturnType<typeof logicalRanges>) {
  const label = referenceLabel(ranges);
  const destination = referenceDestination(ranges);
  const title = referenceTitle(ranges);
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
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (br_if $done
          (i32.and
            (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
            (i32.ne (local.get $byte) (i32.const ${charCode("\t")}))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $more)))
      (local.get $cursor)`,
  );
  const lineEnd = func(
    "referenceLineEnd",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $byte i32)
      (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
        (then
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (if
            (i32.eq
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const ${charCode("\n")}))
            (then
              (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
          (return (local.get $cursor))))
      (if (i32.eq (local.get $byte) (i32.const ${charCode("\n")}))
        (then (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (local.get $cursor))))
      (i64.const -1)`,
  );
  const parse = func(
    "referenceDefinition",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $start i64) (local $next i64) (local $afterLine i64) (local $byte i32)
      (local $indent i32)
      (global.set ${titleStart} (i64.const -1))
      (global.set ${titleEnd} (i64.const -1))
      (block $indented (loop $indentLoop
        (br_if $indented
          (i32.ne
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const ${charCode(" ")})))
        (local.set $indent (i32.add (local.get $indent) (i32.const 1)))
        (if (i32.gt_u (local.get $indent) (i32.const ${maxReferenceIndent})) (then (return (i64.const -1))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (br $indentLoop)))
      (global.set ${labelStart} (local.get $cursor))
      (local.set $cursor
        (call ${label} (local.get $input) (local.get $cursor) (local.get $limit) (i32.const 1)))
      (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
      (local.set $cursor (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.or (i32.eq (local.get $byte) (i32.const ${charCode("\r")})) (i32.eq (local.get $byte) (i32.const ${charCode("\n")})))
        (then
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
          (if
            (i32.and
              (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
              (i32.eq
                (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
                (i32.const ${charCode("\n")})))
            (then
              (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
          (local.set $cursor
            (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))))
      (global.set ${destinationStart} (local.get $cursor))
      (local.set $cursor
        (call ${destination} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
      (global.set ${destinationEnd} (local.get $cursor))
      (local.set $start (local.get $cursor))
      (local.set $next (call ${spaces} (local.get $input) (local.get $cursor) (local.get $limit)))
      (local.set $afterLine
        (call ${lineEnd} (local.get $input) (local.get $next) (local.get $limit)))
      (if (i64.eq (local.get $afterLine) (i64.const -1))
        (then
          (if (i64.eq (local.get $start) (local.get $next)) (then (return (i64.const -1))))
          (global.set ${titleStart} (local.get $next))
          (local.set $cursor
            (call ${title} (local.get $input) (local.get $next) (local.get $limit)))
          (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
          (global.set ${titleEnd} (local.get $cursor))
          (return (call ${lineEnd} (local.get $input) (local.get $cursor) (local.get $limit)))))
      (if (i64.eq (local.get $afterLine) (local.get $next)) (then (return (local.get $afterLine))))
      (local.set $next
        (call ${spaces} (local.get $input) (local.get $afterLine) (local.get $limit)))
      (local.set $cursor (call ${title} (local.get $input) (local.get $next) (local.get $limit)))
      (if (i64.ne (local.get $cursor) (i64.const -1))
        (then
          (local.set $start
            (call ${lineEnd} (local.get $input) (local.get $cursor) (local.get $limit)))
          (if (i64.ne (local.get $start) (i64.const -1))
            (then
              (global.set ${titleStart} (local.get $next))
              (global.set ${titleEnd} (local.get $cursor))
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
  const byteInRange = (first: string, last: string) => {
    const start = charCode(first);
    const width = charCode(last) - start;
    return wat`(i32.le_u (i32.sub (local.get $byte) (i32.const ${start})) (i32.const ${width}))`;
  };
  const asciiPunctuationStart = byteInRange("!", "/");
  const asciiPunctuationMiddle = byteInRange(":", "@");
  const asciiPunctuationBrackets = byteInRange("[", "`");
  const asciiPunctuationEnd = byteInRange("{", "~");
  return func(
    "referenceDestination",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
      (local $byte i32) (local $depth i32) (local $angle i32) (local $count i32)
      (local.set $byte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $byte) (i32.const ${charCode("<")}))
        (then
          (local.set $angle (i32.const 1))
          (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
      (block $done (loop $more
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (local.get $angle)
          (then
            (if
              (i32.or
                (i32.eq (local.get $byte) (i32.const -1))
                (i32.or
                  (i32.eq (local.get $byte) (i32.const ${charCode("\n")}))
                  (i32.or
                    (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
                    (i32.eq (local.get $byte) (i32.const ${charCode("<")})))))
              (then (return (i64.const -1))))
            (if (i32.eq (local.get $byte) (i32.const ${charCode(">")}))
              (then (return (call ${ranges.advance} (local.get $cursor) (local.get $limit))))))
          (else
            (br_if $done
              (i32.or
                (i32.eq (local.get $byte) (i32.const -1))
                (i32.or
                  (i32.le_u (local.get $byte) (i32.const ${charCode(" ")}))
                  (i32.eq (local.get $byte) (i32.const ${asciiDelete})))))
            (if (i32.eq (local.get $byte) (i32.const ${charCode("(")}))
              (then
                (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
                (if (i32.gt_u (local.get $depth) (i32.const ${maxDestinationDepth})) (then (return (i64.const -1))))))
            (if (i32.eq (local.get $byte) (i32.const ${charCode(")")}))
              (then
                (br_if $done (i32.eqz (local.get $depth)))
                (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))))))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("\\")}))
          (then
            (local.set $byte
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
            (if
              (i32.or
                ${asciiPunctuationStart}
                (i32.or
                  ${asciiPunctuationMiddle}
                  (i32.or
                    ${asciiPunctuationBrackets}
                    ${asciiPunctuationEnd})))
              (then
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
      (local.set $open
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.and
          (i32.ne (local.get $open) (i32.const ${charCode('"')}))
          (i32.and
            (i32.ne (local.get $open) (i32.const ${charCode("'")}))
            (i32.ne (local.get $open) (i32.const ${charCode("(")}))))
        (then (return (i64.const -1))))
      (local.set $close
        (if (result i32) (i32.eq (local.get $open) (i32.const ${charCode("(")}))
          (then (i32.const ${charCode(")")}))
          (else (local.get $open))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (loop $more
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i64.const -1))))
        (if (i32.eq (local.get $byte) (local.get $close))
          (then (return (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
        (if
          (i32.and
            (i32.eq (local.get $open) (i32.const ${charCode("(")}))
            (i32.eq (local.get $byte) (i32.const ${charCode("(")})))
          (then (return (i64.const -1))))
        (if
          (i32.or
            (i32.eq (local.get $byte) (i32.const ${charCode("\n")}))
            (i32.eq (local.get $byte) (i32.const ${charCode("\r")})))
          (then
            (if (local.get $afterBreak) (then (return (i64.const -1))))
            (local.set $afterBreak (i32.const 1)))
          (else
            (if
              (i32.and
                (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
                (i32.and
                  (i32.ne (local.get $byte) (i32.const ${charCode("\t")}))
                  (i32.ne (local.get $byte) (i32.const ${charCode("\r")}))))
              (then (local.set $afterBreak (i32.const 0))))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (if
          (i32.and
            (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
            (i32.eq
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const ${charCode("\n")})))
          (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("\\")}))
          (then
            (local.set $byte
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
            (if
              (i32.or
                (i32.eq (local.get $byte) (local.get $open))
                (i32.or
                  (i32.eq (local.get $byte) (local.get $close))
                  (i32.eq (local.get $byte) (i32.const ${charCode("\\")}))))
              (then
                (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))))
        (br $more))
      (i64.const -1)`,
  );
}

export function referenceLabel(ranges: ReturnType<typeof logicalRanges>) {
  const space = func(
    "referenceUnicodeSpace",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
      (local $firstByte i32) (local $secondByte i32) (local $thirdByte i32)
      (local.set $firstByte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if
        (i32.or
          (i32.eq (local.get $firstByte) (i32.const ${charCode(" ")}))
          (i32.or
            (i32.eq (local.get $firstByte) (i32.const ${charCode("\t")}))
            (i32.or
              (i32.eq (local.get $firstByte) (i32.const ${charCode("\n")}))
              (i32.or
                (i32.eq (local.get $firstByte) (i32.const ${charCode("\f")}))
                (i32.eq (local.get $firstByte) (i32.const ${charCode("\r")}))))))
        (then (return (i32.const 1))))
      (if
        (i32.and
          (i32.ne (local.get $firstByte) (i32.const ${noBreakSpaceLead}))
          (i32.and
            (i32.ne (local.get $firstByte) (i32.const ${oghamSpaceLead}))
            (i32.and
              (i32.ne (local.get $firstByte) (i32.const ${generalSpaceLead}))
              (i32.ne (local.get $firstByte) (i32.const ${ideographicSpaceLead})))))
        (then (return (i32.const 0))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $secondByte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $firstByte) (i32.const ${noBreakSpaceLead}))
        (then (return (i32.eq (local.get $secondByte) (i32.const ${noBreakSpaceSecond})))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (local.set $thirdByte
        (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (i32.or
        (i32.and
          (i32.eq (local.get $firstByte) (i32.const ${oghamSpaceLead}))
          (i32.and
            (i32.eq (local.get $secondByte) (i32.const ${oghamSpaceSecond}))
            (i32.eq (local.get $thirdByte) (i32.const ${utf8ContinuationPrefix}))))
        (i32.or
          (i32.and
            (i32.eq (local.get $firstByte) (i32.const ${ideographicSpaceLead}))
            (i32.and
              (i32.eq (local.get $secondByte) (i32.const ${utf8ContinuationPrefix}))
              (i32.eq (local.get $thirdByte) (i32.const ${utf8ContinuationPrefix}))))
          (i32.and
            (i32.eq (local.get $firstByte) (i32.const ${generalSpaceLead}))
            (i32.or
              (i32.and
                (i32.eq (local.get $secondByte) (i32.const ${utf8ContinuationPrefix}))
                (i32.or
                  (i32.le_u (i32.sub (local.get $thirdByte) (i32.const ${spaceBlockFirstByte})) (i32.const ${spaceBlockWidth}))
                  (i32.eq (local.get $thirdByte) (i32.const ${narrowNoBreakSpaceLastByte}))))
              (i32.and
                (i32.eq (local.get $secondByte) (i32.const ${mathematicalSpaceSecondByte}))
                (i32.eq (local.get $thirdByte) (i32.const ${mathematicalSpaceLastByte})))))))`,
  );
  return func(
    "referenceLabel",
    () => wat`
      (param $input i32) (param $cursor i64) (param $limit i32) (param $colon i32) (result i64)
      (local $byte i32) (local $count i32) (local $content i32) (local $afterBreak i32)
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${charCode("[")}))
        (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (block $done (loop $more
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.eq (local.get $byte) (i32.const -1)) (then (return (i64.const -1))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("]")})) (then (br $done)))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("[")})) (then (return (i64.const -1))))
        (if (i32.ne (i32.and (local.get $byte) (i32.const ${utf8ContinuationMask})) (i32.const ${utf8ContinuationPrefix}))
          (then
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (if (i32.gt_u (local.get $count) (i32.const ${maxLabelCodepoints})) (then (return (i64.const -1))))))
        (if
          (i32.or
            (i32.eq (local.get $byte) (i32.const ${charCode("\n")}))
            (i32.eq (local.get $byte) (i32.const ${charCode("\r")})))
          (then
            (if (local.get $afterBreak) (then (return (i64.const -1))))
            (local.set $afterBreak (i32.const 1)))
          (else
            (if
              (i32.and
                (i32.ne (local.get $byte) (i32.const ${charCode(" ")}))
                (i32.and
                  (i32.ne (local.get $byte) (i32.const ${charCode("\t")}))
                  (i32.ne (local.get $byte) (i32.const ${charCode("\r")}))))
              (then (local.set $afterBreak (i32.const 0))))
            (if
              (i32.and
                (i32.ne (i32.and (local.get $byte) (i32.const ${utf8ContinuationMask})) (i32.const ${utf8ContinuationPrefix}))
                (i32.eqz (call ${space} (local.get $input) (local.get $cursor) (local.get $limit))))
              (then (local.set $content (i32.const 1))))))
        (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (if
          (i32.and
            (i32.eq (local.get $byte) (i32.const ${charCode("\r")}))
            (i32.eq
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
              (i32.const ${charCode("\n")})))
          (then (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("\\")}))
          (then
            (local.set $byte
              (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
            (if
              (i32.or
                (i32.eq (local.get $byte) (i32.const ${charCode("[")}))
                (i32.or
                  (i32.eq (local.get $byte) (i32.const ${charCode("]")}))
                  (i32.eq (local.get $byte) (i32.const ${charCode("\\")}))))
              (then
                (local.set $count (i32.add (local.get $count) (i32.const 1)))
                (if (i32.gt_u (local.get $count) (i32.const ${maxLabelCodepoints})) (then (return (i64.const -1))))
                (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))))))
        (br $more)))
      (if (i32.eqz (local.get $content)) (then (return (i64.const -1))))
      (local.set $cursor (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.eqz (local.get $colon)) (then (return (local.get $cursor))))
      (if
        (i32.ne
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const ${charCode(":")}))
        (then (return (i64.const -1))))
      (call ${ranges.advance} (local.get $cursor) (local.get $limit))`,
  );
}
