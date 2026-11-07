import { func, global, wat, type Def, type Fragment } from "#/testing/wat/mod.ts";
import { logicalRanges } from "./logical.ts";
import { logicalUtf8 } from "./utf8.ts";

/**
 * GFM literal autolinks (`www.`, `http(s)://`, and email addresses), following
 * micromark-extension-gfm-autolink-literal exactly. The scanners take a cursor at the
 * candidate start; the caller checks the previous character and the bracket stack.
 *
 * Trail and domain verdicts depend only on position, so a failed trail walk and the
 * last domain scan are remembered: later candidates inside them reuse the result
 * instead of rescanning, which keeps runs like `www.a_b_www.a_b_…` linear. Remembered
 * positions are stored plus one, so that zero means none.
 */
export function literalAutolinks(
  ranges: ReturnType<typeof logicalRanges>,
  unicode: ReturnType<typeof logicalUtf8>,
  punctuation: Def,
  charge: Def,
) {
  const trailFrom = global("autolinkTrailFrom", () => wat`(mut i32) (i32.const 0)`);
  const trailTo = global("autolinkTrailTo", () => wat`(mut i32) (i32.const 0)`);
  const domainFrom = global("autolinkDomainFrom", () => wat`(mut i32) (i32.const 0)`);
  const domainTo = global("autolinkDomainTo", () => wat`(mut i32) (i32.const 0)`);
  const domainEnd = global("autolinkDomainEnd", () => wat`(mut i64) (i64.const 0)`);
  const domainSeen = global("autolinkDomainSeen", () => wat`(mut i32) (i32.const 0)`);
  const dotLast = global("autolinkDotLast", () => wat`(mut i32) (i32.const 0)`);
  const dotSecond = global("autolinkDotSecond", () => wat`(mut i32) (i32.const 0)`);
  const underscore = global("autolinkUnderscore", () => wat`(mut i32) (i32.const 0)`);
  const runFrom = global("autolinkRunFrom", () => wat`(mut i32) (i32.const 0)`);
  const runTo = global("autolinkRunTo", () => wat`(mut i32) (i32.const 0)`);
  const runEnd = global("autolinkRunEnd", () => wat`(mut i64) (i64.const 0)`);
  const emailFailed = global("autolinkEmailFailed", () => wat`(mut i32) (i32.const 0)`);
  const start = global("autolinkStart", () => wat`(mut i64) (i64.const 0)`);
  const reset = func(
    "autolinkReset",
    () => wat`
    (global.set ${trailFrom} (i32.const 0)) (global.set ${trailTo} (i32.const 0))
    (global.set ${domainFrom} (i32.const 0)) (global.set ${domainTo} (i32.const 0))
    (global.set ${runFrom} (i32.const 0)) (global.set ${runTo} (i32.const 0))
    (global.set ${emailFailed} (i32.const 0))`,
  );
  // micromark's line endings, spaces, and JavaScript's \s; the end of input counts too.
  const breaks = func(
    "autolinkBreak",
    () => wat`
    (param $c i32) (result i32)
    (i32.or (i32.or (i32.eq (local.get $c) (i32.const -1)) (i32.le_u (i32.sub (local.get $c) (i32.const 9)) (i32.const 4)))
      (i32.or (i32.or (i32.eq (local.get $c) (i32.const 32)) (i32.eq (local.get $c) (i32.const 160)))
        (i32.or (i32.or (i32.eq (local.get $c) (i32.const 5760)) (i32.le_u (i32.sub (local.get $c) (i32.const 8192)) (i32.const 10)))
          (i32.or (i32.or (i32.le_u (i32.sub (local.get $c) (i32.const 8232)) (i32.const 1)) (i32.eq (local.get $c) (i32.const 8239)))
            (i32.or (i32.or (i32.eq (local.get $c) (i32.const 8287)) (i32.eq (local.get $c) (i32.const 12288)))
              (i32.eq (local.get $c) (i32.const 65279)))))))`,
  );
  // micromark classifies UTF-16 code units, so astral characters are never punctuation.
  const punct = func(
    "autolinkPunctuation",
    () => wat`
    (param $c i32) (result i32)
    (if (result i32) (i32.le_u (local.get $c) (i32.const 65535))
      (then (call ${punctuation} (local.get $c))) (else (i32.const 0)))`,
  );
  const alpha = (c: Fragment) =>
    wat`(i32.le_u (i32.sub (i32.or ${c} (i32.const 32)) (i32.const 97)) (i32.const 25))`;
  const alnum = (c: Fragment) =>
    wat`(i32.or ${alpha(c)} (i32.le_u (i32.sub ${c} (i32.const 48)) (i32.const 9)))`;
  const atext = func(
    "autolinkAtext",
    () => wat`
    (param $c i32) (result i32)
    (i32.or ${alnum(wat`(local.get $c)`)}
      (i32.or (i32.or (i32.eq (local.get $c) (i32.const 43)) (i32.eq (local.get $c) (i32.const 45)))
        (i32.or (i32.eq (local.get $c) (i32.const 46)) (i32.eq (local.get $c) (i32.const 95)))))`,
  );
  const at = (cursor: Fragment) =>
    wat`(call ${unicode.decode} (local.get $input) ${cursor} (local.get $limit))`;
  const next = (cursor: Fragment) => wat`(call ${ranges.advance} ${cursor} (local.get $limit))`;
  const step = func(
    "autolinkStep",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $lead i32) (local $count i32)
    (local.set $lead (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (local.set $cursor ${next(wat`(local.get $cursor)`)})
    (if (i32.ge_u (local.get $lead) (i32.const 192)) (then
      (block $done (loop $more
        (br_if $done (i32.ge_u (local.get $count) (i32.const 3)))
        (br_if $done (i32.ne (i32.and (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
          (i32.const 192)) (i32.const 128)))
        (local.set $cursor ${next(wat`(local.get $cursor)`)})
        (local.set $count (i32.add (local.get $count) (i32.const 1))) (br $more)))))
    (local.get $cursor)`,
  );
  const pos = (cursor: Fragment) => wat`(i32.wrap_i64 ${cursor})`;
  const after = (cursor: Fragment) => wat`(i32.add (i32.wrap_i64 ${cursor}) (i32.const 1))`;
  // One of !"')*,.:;?_~ — the characters a trail may repeat.
  const trailing = (c: Fragment) => wat`
    (i32.or (i32.or (i32.eq ${c} (i32.const 33)) (i32.eq ${c} (i32.const 34)))
      (i32.or (i32.or (i32.eq ${c} (i32.const 39)) (i32.eq ${c} (i32.const 41)))
        (i32.or (i32.or (i32.eq ${c} (i32.const 42)) (i32.eq ${c} (i32.const 44)))
          (i32.or (i32.or (i32.eq ${c} (i32.const 46)) (i32.le_u (i32.sub ${c} (i32.const 58)) (i32.const 1)))
            (i32.or (i32.or (i32.eq ${c} (i32.const 63)) (i32.eq ${c} (i32.const 95))) (i32.eq ${c} (i32.const 126)))))))`;
  const trail = func(
    "autolinkTrail",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i32)
    (local $start i32) (local $c i32)
    (local.set $start ${pos(wat`(local.get $cursor)`)})
    (if (i32.and (i32.ge_u (local.get $start) (global.get ${trailFrom})) (i32.lt_u (local.get $start) (global.get ${trailTo})))
      (then (return (i32.const 0))))
    (block $fail (loop $more
      (call ${charge} (i64.const 1))
      (local.set $c ${at(wat`(local.get $cursor)`)})
      (if ${trailing(wat`(local.get $c)`)} (then
        (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
      (if (i32.eq (local.get $c) (i32.const 38)) (then
        (local.set $cursor ${next(wat`(local.get $cursor)`)})
        (br_if $fail (i32.eqz ${alpha(at(wat`(local.get $cursor)`))}))
        (block $name (loop $letters
          (local.set $c ${at(wat`(local.get $cursor)`)})
          (br_if $name (i32.eqz ${alpha(wat`(local.get $c)`)}))
          (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $letters)))
        (br_if $fail (i32.ne (local.get $c) (i32.const 59)))
        (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
      (if (i32.eq (local.get $c) (i32.const 93)) (then
        (local.set $cursor ${next(wat`(local.get $cursor)`)})
        (local.set $c ${at(wat`(local.get $cursor)`)})
        (if (i32.or (call ${breaks} (local.get $c))
          (i32.or (i32.eq (local.get $c) (i32.const 40)) (i32.eq (local.get $c) (i32.const 91))))
          (then (return (i32.const 1))))
        (br $more)))
      (if (i32.or (i32.eq (local.get $c) (i32.const 60)) (call ${breaks} (local.get $c)))
        (then (return (i32.const 1))))))
    (global.set ${trailFrom} (local.get $start))
    (global.set ${trailTo} ${pos(wat`(local.get $cursor)`)})
    (i32.const 0)`,
  );
  const domain = func(
    "autolinkDomain",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $start i32) (local $c i32)
    (local.set $start ${pos(wat`(local.get $cursor)`)})
    (if (i32.eqz (i32.and (i32.ge_u (local.get $start) (global.get ${domainFrom})) (i32.lt_u (local.get $start) (global.get ${domainTo})))) (then
      (global.set ${domainFrom} (local.get $start))
      (global.set ${domainSeen} (i32.const 0))
      (global.set ${dotLast} (i32.const 0)) (global.set ${dotSecond} (i32.const 0)) (global.set ${underscore} (i32.const 0))
      (block $done (loop $more
        (call ${charge} (i64.const 1))
        (local.set $c ${at(wat`(local.get $cursor)`)})
        (if (i32.or (i32.eq (local.get $c) (i32.const 46)) (i32.eq (local.get $c) (i32.const 95))) (then
          (br_if $done (call ${trail} (local.get $input) (local.get $cursor) (local.get $limit)))
          (if (i32.eq (local.get $c) (i32.const 95))
            (then (global.set ${underscore} ${after(wat`(local.get $cursor)`)}))
            (else (global.set ${dotSecond} (global.get ${dotLast})) (global.set ${dotLast} ${after(wat`(local.get $cursor)`)})))
          (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
        (br_if $done (call ${breaks} (local.get $c)))
        (br_if $done (i32.and (i32.ne (local.get $c) (i32.const 45)) (call ${punct} (local.get $c))))
        (global.set ${domainSeen} ${after(wat`(local.get $cursor)`)})
        (local.set $cursor (call ${step} (local.get $input) (local.get $cursor) (local.get $limit))) (br $more)))
      (global.set ${domainTo} ${pos(wat`(local.get $cursor)`)})
      (global.set ${domainEnd} (local.get $cursor))))
    ;; An underscore in either of the last two segments (counted from this start) fails.
    (if (i32.and (i32.gt_u (global.get ${underscore}) (local.get $start))
      (i32.or (i32.le_u (global.get ${dotSecond}) (local.get $start)) (i32.gt_u (global.get ${underscore}) (global.get ${dotSecond}))))
      (then (return (i64.const -1))))
    (if (i32.le_u (global.get ${domainSeen}) (local.get $start)) (then (return (i64.const -1))))
    (global.get ${domainEnd})`,
  );
  const path = func(
    "autolinkPath",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $c i32) (local $open i32) (local $close i32)
    (block $done (loop $more
      (call ${charge} (i64.const 1))
      (local.set $c ${at(wat`(local.get $cursor)`)})
      (if (i32.eq (local.get $c) (i32.const 40)) (then
        (local.set $open (i32.add (local.get $open) (i32.const 1)))
        (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
      (if (i32.and (i32.eq (local.get $c) (i32.const 41)) (i32.lt_u (local.get $close) (local.get $open))) (then
        (local.set $close (i32.add (local.get $close) (i32.const 1)))
        (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
      (if (i32.or ${trailing(wat`(local.get $c)`)}
        (i32.or (i32.or (i32.eq (local.get $c) (i32.const 38)) (i32.eq (local.get $c) (i32.const 60)))
          (i32.eq (local.get $c) (i32.const 93)))) (then
        (br_if $done (call ${trail} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if (i32.eq (local.get $c) (i32.const 41)) (then (local.set $close (i32.add (local.get $close) (i32.const 1)))))
        (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
      (br_if $done (call ${breaks} (local.get $c)))
      (local.set $cursor (call ${step} (local.get $input) (local.get $cursor) (local.get $limit))) (br $more)))
    (local.get $cursor)`,
  );
  const www = func(
    "autolinkWww",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $look i64) (local $count i32)
    (local.set $look (local.get $cursor))
    (block $prefix (loop $more
      (br_if $prefix (i32.ge_u (local.get $count) (i32.const 3)))
      (if (i32.ne (i32.or (call ${ranges.peek} (local.get $input) (local.get $look) (local.get $limit)) (i32.const 32)) (i32.const 119))
        (then (return (i64.const -1))))
      (local.set $look ${next(wat`(local.get $look)`)})
      (local.set $count (i32.add (local.get $count) (i32.const 1))) (br $more)))
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $look) (local.get $limit)) (i32.const 46))
      (then (return (i64.const -1))))
    (local.set $look ${next(wat`(local.get $look)`)})
    (if (i32.eq (call ${ranges.peek} (local.get $input) (local.get $look) (local.get $limit)) (i32.const -1))
      (then (return (i64.const -1))))
    (local.set $look (call ${domain} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i64.eq (local.get $look) (i64.const -1)) (then (return (i64.const -1))))
    (call ${path} (local.get $input) (local.get $look) (local.get $limit))`,
  );
  const protocol = func(
    "autolinkProtocol",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $c i32) (local $name i32) (local $count i32)
    (if (i32.ne (i32.or (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 32)) (i32.const 104))
      (then (return (i64.const -1))))
    (block $named (loop $more
      (local.set $c (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $named (i32.or (i32.ge_u (local.get $count) (i32.const 5)) (i32.eqz ${alpha(wat`(local.get $c)`)})))
      (local.set $name (i32.or (i32.shl (local.get $name) (i32.const 8)) (i32.or (local.get $c) (i32.const 32))))
      (local.set $count (i32.add (local.get $count) (i32.const 1)))
      (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
    ;; "http", or "https" with its first byte shifted out.
    (if (i32.eqz (i32.or (i32.and (i32.eq (local.get $count) (i32.const 4)) (i32.eq (local.get $name) (i32.const 0x68747470)))
      (i32.and (i32.eq (local.get $count) (i32.const 5)) (i32.eq (local.get $name) (i32.const 0x74747073)))))
      (then (return (i64.const -1))))
    (if (i32.ne (local.get $c) (i32.const 58)) (then (return (i64.const -1))))
    (local.set $cursor ${next(wat`(local.get $cursor)`)})
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 47))
      (then (return (i64.const -1))))
    (local.set $cursor ${next(wat`(local.get $cursor)`)})
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const 47))
      (then (return (i64.const -1))))
    (local.set $cursor ${next(wat`(local.get $cursor)`)})
    (local.set $c ${at(wat`(local.get $cursor)`)})
    (if (i32.or (i32.or (call ${breaks} (local.get $c)) (call ${punct} (local.get $c)))
      (i32.or (i32.lt_u (local.get $c) (i32.const 32)) (i32.eq (local.get $c) (i32.const 127))))
      (then (return (i64.const -1))))
    (local.set $cursor (call ${domain} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i64.eq (local.get $cursor) (i64.const -1)) (then (return (i64.const -1))))
    (call ${path} (local.get $input) (local.get $cursor) (local.get $limit))`,
  );
  const email = func(
    "autolinkEmail",
    () => wat`
    (param $input i32) (param $cursor i64) (param $limit i32) (result i64)
    (local $c i32) (local $last i32) (local $dot i32) (local $data i32) (local $look i64)
    (if (i32.eqz (call ${atext} (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))))
      (then (return (i64.const -1))))
    (block $local (loop $more
      (call ${charge} (i64.const 1))
      (local.set $c (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (br_if $local (i32.eqz (call ${atext} (local.get $c))))
      (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
    (if (i32.ne (local.get $c) (i32.const 64)) (then (return (i64.const -1))))
    (local.set $cursor ${next(wat`(local.get $cursor)`)})
    (block $done (loop $more
      (call ${charge} (i64.const 1))
      (local.set $c (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (local.get $c) (i32.const 46)) (then
        (local.set $look ${next(wat`(local.get $cursor)`)})
        (br_if $done (i32.eqz ${alnum(wat`(call ${ranges.peek} (local.get $input) (local.get $look) (local.get $limit))`)}))
        (local.set $dot (i32.const 1)) (local.set $last (local.get $c))
        (local.set $cursor (local.get $look)) (br $more)))
      (br_if $done (i32.eqz (i32.or ${alnum(wat`(local.get $c)`)}
        (i32.or (i32.eq (local.get $c) (i32.const 45)) (i32.eq (local.get $c) (i32.const 95))))))
      (local.set $data (i32.const 1)) (local.set $last (local.get $c))
      (local.set $cursor ${next(wat`(local.get $cursor)`)}) (br $more)))
    (if (i32.and (i32.and (local.get $data) (local.get $dot)) ${alpha(wat`(local.get $last)`)})
      (then (return (local.get $cursor))))
    (i64.const -1)`,
  );
  const before = (cursor: Fragment) =>
    wat`(call ${unicode.before} (local.get $input) ${cursor} (local.get $start) (local.get $limit))`;
  // The start of the atext run ending at the cursor, not reaching back below the floor.
  const runStart = func(
    "autolinkRunStart",
    () => wat`
    (param $input i32) (param $cursor i64) (param $floor i32) (param $start i64) (param $limit i32) (result i64)
    (local $previous i64)
    (block $done (loop $more
      (call ${charge} (i64.const 1))
      (local.set $previous (call ${unicode.previous} (local.get $cursor) (local.get $start) (local.get $limit)))
      (br_if $done (i64.eq (local.get $previous) (i64.const -1)))
      (br_if $done (i32.lt_u ${pos(wat`(local.get $previous)`)} (local.get $floor)))
      (br_if $done (i32.eqz (call ${atext} (call ${ranges.peek} (local.get $input) (local.get $previous) (local.get $limit)))))
      (local.set $cursor (local.get $previous)) (br $more)))
    (local.get $cursor)`,
  );
  // An email from the start of the atext run around the cursor, which can only succeed
  // if the run continues forward to an "@".
  const emailAround = func(
    "autolinkEmailAround",
    () => wat`
    (param $input i32) (param $cursor i64) (param $floor i32) (param $start i64) (param $limit i32) (result i64)
    (local $end i64) (local $at i32) (local $from i64)
    (if (i32.and (i32.ge_u ${pos(wat`(local.get $cursor)`)} (global.get ${runFrom})) (i32.lt_u ${pos(wat`(local.get $cursor)`)} (global.get ${runTo})))
      (then (local.set $end (global.get ${runEnd})))
      (else
        (global.set ${runFrom} ${pos(wat`(local.get $cursor)`)})
        (local.set $end (local.get $cursor))
        (block $done (loop $more
          (call ${charge} (i64.const 1))
          (br_if $done (i32.eqz (call ${atext} (call ${ranges.peek} (local.get $input) (local.get $end) (local.get $limit)))))
          (local.set $end ${next(wat`(local.get $end)`)}) (br $more)))
        (global.set ${runTo} ${pos(wat`(local.get $end)`)})
        (global.set ${runEnd} (local.get $end))))
    (if (i32.ne (call ${ranges.peek} (local.get $input) (local.get $end) (local.get $limit)) (i32.const 64))
      (then (return (i64.const -1))))
    (local.set $at ${after(wat`(local.get $end)`)})
    (if (i32.eq (local.get $at) (global.get ${emailFailed})) (then (return (i64.const -1))))
    (local.set $from (call ${runStart} (local.get $input) (local.get $cursor) (local.get $floor) (local.get $start) (local.get $limit)))
    (local.set $end (i64.const -1))
    (if (i32.eqz (i32.or (i32.eq ${before(wat`(local.get $from)`)} (i32.const 47)) (call ${atext} ${before(wat`(local.get $from)`)}))) (then
      (local.set $end (call ${email} (local.get $input) (local.get $from) (local.get $limit)))))
    (if (i64.eq (local.get $end) (i64.const -1))
      (then (global.set ${emailFailed} (local.get $at)))
      (else (global.set ${start} (local.get $from))))
    (local.get $end)`,
  );
  /**
   * A literal autolink around a stop at ".", ":" or "@"; its start is left in `start`.
   * Characters below the floor belong to earlier constructs.
   */
  const candidate = func(
    "autolinkCandidate",
    () => wat`
    (param $input i32) (param $cursor i64) (param $floor i32) (param $start i64) (param $limit i32) (result i64)
    (local $byte i32) (local $from i64) (local $previous i64) (local $count i32) (local $end i64) (local $c i32)
    (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
    (if (i32.eq (local.get $byte) (i32.const 64)) (then
      (return (call ${emailAround} (local.get $input) (local.get $cursor) (local.get $floor) (local.get $start) (local.get $limit)))))
    (local.set $from (local.get $cursor))
    (block $found (loop $more
      (local.set $previous (call ${unicode.previous} (local.get $from) (local.get $start) (local.get $limit)))
      (br_if $found (i64.eq (local.get $previous) (i64.const -1)))
      (br_if $found (i32.lt_u ${pos(wat`(local.get $previous)`)} (local.get $floor)))
      (br_if $found (i32.eqz ${alpha(wat`(call ${ranges.peek} (local.get $input) (local.get $previous) (local.get $limit))`)}))
      (br_if $found (i32.ge_u (local.get $count) (i32.const 6)))
      (local.set $from (local.get $previous))
      (local.set $count (i32.add (local.get $count) (i32.const 1)))
      (br $more)))
    (if (i32.eq (local.get $byte) (i32.const 58)) (then
      (if ${alpha(before(wat`(local.get $from)`))} (then (return (i64.const -1))))
      (local.set $end (call ${protocol} (local.get $input) (local.get $from) (local.get $limit)))
      (if (i64.ne (local.get $end) (i64.const -1)) (then (global.set ${start} (local.get $from))))
      (return (local.get $end))))
    ;; "www" is the last three letters before the ".", and email is attempted first.
    (if (i32.lt_u (local.get $count) (i32.const 3)) (then (return (i64.const -1))))
    (local.set $from (local.get $cursor))
    (local.set $count (i32.const 3))
    (block $back (loop $more
      (br_if $back (i32.eqz (local.get $count)))
      (local.set $from (call ${unicode.previous} (local.get $from) (local.get $start) (local.get $limit)))
      (local.set $count (i32.sub (local.get $count) (i32.const 1))) (br $more)))
    (local.set $end (call ${emailAround} (local.get $input) (local.get $from) (local.get $floor) (local.get $start) (local.get $limit)))
    (if (i64.ne (local.get $end) (i64.const -1)) (then (return (local.get $end))))
    (local.set $c ${before(wat`(local.get $from)`)})
    (if (i32.eqz ${[-1, 9, 10, 13, 32, 40, 42, 91, 93, 95, 126]
      .map((code) => wat`(i32.eq (local.get $c) (i32.const ${code}))`)
      .reduce((a, b) => wat`(i32.or ${a} ${b})`)})
      (then (return (i64.const -1))))
    (local.set $end (call ${www} (local.get $input) (local.get $from) (local.get $limit)))
    (if (i64.ne (local.get $end) (i64.const -1)) (then (global.set ${start} (local.get $from))))
    (local.get $end)`,
  );
  return { reset, www, protocol, email, atext, candidate, start };
}
