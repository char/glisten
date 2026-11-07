import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { delimiterResolver, delimiterSuffixResolver } from "./delimiters.ts";
import { inlineAtoms } from "./inline_atoms.ts";
import { bracketStack } from "./brackets.ts";
import { inlineResource } from "./resource.ts";
import { bracket, delimiterStackEntry, ends, event, get, link, match, run } from "./layout.ts";
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
  links: ReturnType<typeof bracketStack>,
  resource: ReturnType<typeof inlineResource>,
  charge: Def,
) {
  const unicode = logicalUtf8(ranges, scratch.address, charge);
  const flanking = delimiterFlanking(
    unicodePunctuation(wat`(i32.add (global.get $base) (i32.const 544))`),
    unicodeWhitespace(),
  );
  const resolve = delimiterSuffixResolver(charge, delimiterResolver(charge, delimiterMatch()));
  const first = global("attentionFirst", () => wat`(mut i32) (i32.const 0)`);
  const nodes = global("attentionNodes", () => wat`(mut i32) (i32.const 0)`);
  const pairs = global("attentionPairs", () => wat`(mut i32) (i32.const 0)`);
  const heads = global("attentionHeads", () => wat`(mut i32) (i32.const 0)`);
  const inScratch = (offset: string) =>
    wat`(i32.add (global.get ${scratch.address}) ${get(offset)})`;
  const appendEvent = () => wat`
    (local.set $event ${event.at(wat`(global.get ${inline.events})`, get("eventCount"))})
    (local.set $eventCount (i32.add (local.get $eventCount) (i32.const 1)))
    (call ${charge} (i64.const ${event.size}))
    (if (local.get $last) (then
      ${event.set(inScratch("last"), "next", get("event"))})
      (else (global.set ${first} (local.get $event))))
    (local.set $address ${inScratch("event")})
    ${event.set(get("address"), "next", wat`(i32.const 0)`)}
    ${event.set(get("address"), "style", get("eventStyle"))}
    ${event.set(get("address"), "start", get("eventStart"))}
    ${event.set(get("address"), "end", get("eventEnd"))}
    (local.set $last (local.get $event))`;
  const build = func(
    "buildAttention",
    () => wat`
    (param $input i32) (param $start i64) (param $limit i32) (param $out i32)
    (local $cursor i64) (local $gap i64) (local $atom i64) (local $after i64) (local $byte i32)
    (local $eventStart i64) (local $eventEnd i64) (local $eventStyle i32)
    (local $event i32) (local $last i32) (local $eventCount i32) (local $address i32) (local $count i32)
    (local $marker i32) (local $length i32) (local $node i32) (local $flags i32)
    (local $matches i32) (local $pair i32) (local $i i32)
    (local $depth i32) (local $brackets i32) (local $linkCount i32) (local $next i64) (local $linkAddress i32)
    (local $openHead i32) (local $closeHead i32) (local $tail i32) (local $entry i32)
    (global.set ${first} (i32.const 0))
    (call ${links.reset})
    (global.set ${nodes} (global.get ${inline.runs}))
    (local.set $cursor (local.get $start))
    (local.set $gap (local.get $start))
    (block $collected (loop $collect
      (local.set $cursor (call ${inline.next} (local.get $input) (local.get $cursor) (local.get $limit)))
      (if (i32.eq (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)) (i32.const -1)) (then
        (if (i32.lt_u (i32.wrap_i64 (local.get $gap)) (i32.wrap_i64 (local.get $cursor))) (then
          (local.set $eventStart (local.get $gap)) (local.set $eventEnd (local.get $cursor))
          (local.set $eventStyle (i32.const ${kind.inlineText}))
          ${appendEvent()}))
        (br $collected)))
      (local.set $byte (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
      (local.set $after (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
      (if (i32.or (i32.or (i32.eq (local.get $byte) (i32.const 91)) (i32.eq (local.get $byte) (i32.const 93)))
        (i32.and (i32.eq (local.get $byte) (i32.const 33))
          (i32.eq (call ${ranges.peek} (local.get $input) (local.get $after) (local.get $limit)) (i32.const 91))))
        (then
          (local.set $atom (local.get $cursor))
          (if (i32.eq (local.get $byte) (i32.const 33)) (then
            (local.set $after (call ${ranges.advance} (local.get $after) (local.get $limit)))))
          (global.set ${inline.end} (local.get $after))
          (global.set ${inline.style} (i32.const ${kind.inlineBracket})))
        (else
          (local.set $atom (call ${inline.parse} (local.get $input) (local.get $cursor) (local.get $limit) (local.get $out)))))
      (if (i64.eq (local.get $atom) (i64.const -1)) (then
        (local.set $cursor (global.get ${inline.end})) (br $collect)))
      (if (i32.lt_u (i32.wrap_i64 (local.get $gap)) (i32.wrap_i64 (local.get $atom))) (then
        (local.set $eventStart (local.get $gap)) (local.set $eventEnd (local.get $atom))
        (local.set $eventStyle (i32.const ${kind.inlineText}))
        ${appendEvent()}))
      (if (i32.eq (local.get $byte) (i32.const 93)) (then
        (local.set $next (call ${links.close} (local.get $input) (global.get ${scratch.address}) (local.get $after) (local.get $limit)))
        (if (i64.ne (local.get $next) (i64.const -1)) (then
          ;; The link's emphasis resolves inside it, and leaves the delimiter stack.
          (local.set $matches (i32.add (local.get $matches) (call ${resolve} (i32.add (global.get ${scratch.address}) (global.get ${nodes}))
            (i32.add (global.get ${scratch.address}) (global.get ${inline.stack})) (global.get ${links.delimiterBottom}) (local.get $depth)
            (i32.add (global.get ${scratch.address}) (global.get ${inline.work}))
            (i32.add (global.get ${scratch.address}) (global.get ${inline.bottoms}))
            (i32.add (global.get ${scratch.address}) ${match.at(wat`(global.get ${inline.matches})`, get("matches"))}))))
          (local.set $depth (global.get ${links.delimiterBottom}))
          (local.set $address (i32.add (global.get ${scratch.address})
            ${bracket.get(wat`(i32.add (global.get ${scratch.address}) (global.get ${links.entry}))`, "event")}))
          ${event.set(get("address"), "style", wat`(i32.const ${kind.linkOpen})`)}
          ${event.set(get("address"), "run", get("linkCount"))}
          (local.set $linkAddress (i32.add (global.get ${scratch.address}) ${link.at(wat`(global.get ${inline.links})`, get("linkCount"))}))
          (if (global.get ${links.form})
            (then
              ${link.set(get("linkAddress"), "uri", wat`(i32.const -1)`)}
              ${link.set(get("linkAddress"), "titleStart", wat`(i32.const -1)`)})
            (else
              ${link.set(get("linkAddress"), "uri", wat`(i32.wrap_i64 (call ${ranges.advance} (local.get $after) (local.get $limit)))`)}
              ${link.set(
                get("linkAddress"),
                "titleStart",
                wat`(if (result i32) (i64.eq (global.get ${resource.titleStart}) (i64.const -1))
                (then (i32.const -1)) (else (i32.wrap_i64 (global.get ${resource.titleStart}))))`,
              )}
              ${link.set(get("linkAddress"), "titleEnd", wat`(i32.wrap_i64 (global.get ${resource.titleEnd}))`)}))
          (local.set $eventStart (local.get $atom)) (local.set $eventEnd (local.get $next))
          (local.set $eventStyle (i32.const ${kind.linkTail}))
          ${appendEvent()}
          ${event.set(get("address"), "run", get("linkCount"))}
          (local.set $linkCount (i32.add (local.get $linkCount) (i32.const 1)))
          (local.set $cursor (local.get $next))
          (local.set $gap (local.get $cursor))
          (br $collect)))))
      (local.set $eventStart (local.get $atom)) (local.set $eventEnd (global.get ${inline.end}))
      (local.set $eventStyle (global.get ${inline.style}))
      ${appendEvent()}
      (if (i32.and (i32.eq (local.get $eventStyle) (i32.const ${kind.inlineBracket})) (i32.ne (local.get $byte) (i32.const 93))) (then
        (local.set $entry (i32.add (global.get ${inline.brackets}) (i32.mul (local.get $brackets) (i32.const ${bracket.size}))))
        (local.set $brackets (i32.add (local.get $brackets) (i32.const 1)))
        ;; An image's label starts at its "[", after the "!".
        (call ${links.push} (global.get ${scratch.address}) (local.get $entry)
          (if (result i64) (i32.eq (local.get $byte) (i32.const 33))
            (then (call ${ranges.advance} (local.get $eventStart) (local.get $limit))) (else (local.get $eventStart)))
          (i32.eq (local.get $byte) (i32.const 33)) (local.get $depth))
        ${bracket.set(wat`(i32.add (global.get ${scratch.address}) (local.get $entry))`, "event", get("event"))}))
      (if (i32.eq (local.get $eventStyle) (i32.const ${kind.delimiterRun})) (then
        (local.set $length (i32.sub (i32.wrap_i64 (local.get $eventEnd)) (i32.wrap_i64 (local.get $eventStart))))
        (local.set $marker (call ${ranges.peek} (local.get $input) (local.get $eventStart) (local.get $limit)))
        (local.set $flags (call ${flanking}
          (call ${unicode.before} (local.get $input) (local.get $eventStart) (local.get $start) (local.get $limit))
          (call ${unicode.decode} (local.get $input) (local.get $eventEnd) (local.get $limit)) (local.get $marker)))
        (if (i32.and (i32.eq (local.get $marker) (i32.const 126)) (i32.gt_u (local.get $length) (i32.const 2))) (then
          (local.set $flags (i32.const 0))))
        (local.set $node (i32.add (global.get ${scratch.address}) ${run.at(wat`(global.get ${nodes})`, get("count"))}))
        ${run.set(get("node"), "position", wat`(i32.wrap_i64 (local.get $eventStart))`)}
        ${run.set(get("node"), "length", get("length"))}
        ${run.set(get("node"), "marker", get("marker"))}
        ${run.set(get("node"), "flags", get("flags"))}
        ${event.set(get("address"), "run", get("count"))}
        ${delimiterStackEntry.set(wat`(i32.add (global.get ${scratch.address}) ${delimiterStackEntry.at(wat`(global.get ${inline.stack})`, get("depth"))})`, "index", get("count"))}
        (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))))
      (local.set $cursor (local.get $eventEnd))
      (local.set $gap (local.get $cursor))
      (br $collect)))
    (global.set ${heads} (global.get ${inline.heads}))
    (global.set ${pairs} (global.get ${inline.matches}))
    (call ${charge} (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${ends.size})))
    (memory.fill (i32.add (global.get ${scratch.address}) (global.get ${heads})) (i32.const 255) (i32.mul (local.get $count) (i32.const ${ends.size})))
    (local.set $matches (i32.add (local.get $matches) (call ${resolve} (i32.add (global.get ${scratch.address}) (global.get ${nodes}))
      (i32.add (global.get ${scratch.address}) (global.get ${inline.stack})) (i32.const 0) (local.get $depth)
      (i32.add (global.get ${scratch.address}) (global.get ${inline.work}))
      (i32.add (global.get ${scratch.address}) (global.get ${inline.bottoms}))
      (i32.add (global.get ${scratch.address}) ${match.at(wat`(global.get ${pairs})`, get("matches"))}))))
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
