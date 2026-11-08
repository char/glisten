import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { cursorPosition } from "./cursor.ts";
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
import { literalAutolinks } from "./literal_autolinks.ts";
import { kind, styled } from "./styles.ts";

export function attention(
  ranges: ReturnType<typeof logicalRanges>,
  scratch: ReturnType<typeof paragraphScratch>,
  inline: ReturnType<typeof inlineAtoms>,
  links: ReturnType<typeof bracketStack>,
  resource: ReturnType<typeof inlineResource>,
  charge: Def,
) {
  const unicode = logicalUtf8(ranges, scratch.address, charge);
  const charCode = (character: string) => character.charCodeAt(0);
  const punctuationTableOffset = 544;
  const punctuation = unicodePunctuation(
    wat`(i32.add (global.get $base) (i32.const ${punctuationTableOffset}))`,
  );
  const flanking = delimiterFlanking(punctuation, unicodeWhitespace());
  const autolinks = literalAutolinks(ranges, unicode, punctuation, charge);
  const resolve = delimiterSuffixResolver(charge, delimiterResolver(charge, delimiterMatch()));
  const first = global("attentionFirst", () => wat`(mut i32) (i32.const 0)`);
  const nodes = global("attentionNodes", () => wat`(mut i32) (i32.const 0)`);
  const pairs = global("attentionPairs", () => wat`(mut i32) (i32.const 0)`);
  const heads = global("attentionHeads", () => wat`(mut i32) (i32.const 0)`);
  const cursorPos = (local: string) => cursorPosition(get(local));
  const inScratch = (offset: string) =>
    wat`(i32.add (global.get ${scratch.address}) ${get(offset)})`;
  const eventsBase = wat`(global.get ${inline.events})`;
  const nextEvent = event.at(eventsBase, get("eventCount"));
  const previousEvent = event.at(eventsBase, wat`(i32.sub (local.get $eventCount) (i32.const 1))`);
  const clearEventNext = event.set(get("address"), "next", wat`(i32.const 0)`);
  const clearLastNext = event.set(inScratch("last"), "next", wat`(i32.const 0)`);
  const inlineMatchAtCount = match.at(wat`(global.get ${inline.matches})`, get("matches"));
  const bracketEvent = bracket.get(
    wat`(i32.add (global.get ${scratch.address}) (global.get ${links.entry}))`,
    "event",
  );
  const markLinkOpen = event.set(get("address"), "style", wat`(i32.const ${kind.linkOpen})`);
  const linkAtCount = link.at(wat`(global.get ${inline.links})`, get("linkCount"));
  const clearLinkUri = link.set(get("linkAddress"), "uri", wat`(i32.const -1)`);
  const clearLinkTitle = link.set(get("linkAddress"), "titleStart", wat`(i32.const -1)`);
  const uriStart = wat`(call ${ranges.advance} (local.get $after) (local.get $limit))`;
  const setLinkUri = link.set(get("linkAddress"), "uri", cursorPosition(uriStart));
  const titleStartPosition = cursorPosition(wat`(global.get ${resource.titleStart})`);
  const setLinkTitleStart = link.set(
    get("linkAddress"),
    "titleStart",
    wat`(if (result i32) (i64.eq (global.get ${resource.titleStart}) (i64.const -1))
                (then (i32.const -1)) (else ${titleStartPosition}))`,
  );
  const setLinkTitleEnd = link.set(
    get("linkAddress"),
    "titleEnd",
    cursorPosition(wat`(global.get ${resource.titleEnd})`),
  );
  const setBracketEvent = bracket.set(
    wat`(i32.add (global.get ${scratch.address}) (local.get $entry))`,
    "event",
    get("event"),
  );
  const runAtCount = run.at(wat`(global.get ${nodes})`, get("count"));
  const setRunPosition = run.set(get("node"), "position", cursorPos("eventStart"));
  const stackBase = wat`(global.get ${inline.stack})`;
  const stackEntryOffset = delimiterStackEntry.at(stackBase, get("depth"));
  const stackEntryAddress = wat`(i32.add (global.get ${scratch.address}) ${stackEntryOffset})`;
  const pushDelimiter = delimiterStackEntry.set(stackEntryAddress, "index", get("count"));
  const matchAtCount = match.at(wat`(global.get ${pairs})`, get("matches"));
  const matchAtIndex = match.at(wat`(global.get ${pairs})`, get("matchIndex"));
  const openingHead = ends.at(wat`(global.get ${heads})`, match.get(get("pair"), "opener"));
  const closingHead = ends.at(wat`(global.get ${heads})`, match.get(get("pair"), "closer"));
  const clearNextClosing = match.set(get("pair"), "nextClosing", wat`(i32.const -1)`);
  const matchesBase = wat`(global.get ${pairs})`;
  const closingTailOffset = match.at(matchesBase, get("tail"));
  const closingTailAddress = wat`(i32.add (global.get ${scratch.address}) ${closingTailOffset})`;
  const linkClosingTail = match.set(closingTailAddress, "nextClosing", get("matchIndex"));
  const connectLastEvent = event.set(inScratch("last"), "next", get("event"));
  const currentEventAddress = inScratch("event");
  const setEventStyle = event.set(get("address"), "style", get("eventStyle"));
  const setEventStart = event.set(get("address"), "start", get("eventStart"));
  const setEventEnd = event.set(get("address"), "end", get("eventEnd"));
  const eventEnd = event.get(get("address"), "end");
  const eventEndPosition = cursorPosition(eventEnd);
  const eventStyle = event.get(get("address"), "style");
  const eventStart = event.get(get("address"), "start");
  const uriStyle = styled("text.uri");
  const setLinkEventIndex = event.set(get("address"), "run", get("linkCount"));
  const setRunLength = run.set(get("node"), "length", get("length"));
  const setRunMarker = run.set(get("node"), "marker", get("marker"));
  const setRunFlags = run.set(get("node"), "flags", get("flags"));
  const setDelimiterEventIndex = event.set(get("address"), "run", get("count"));
  const linkNextOpening = match.set(get("pair"), "nextOpening", ends.get(get("openHead"), "opens"));
  const setFirstOpening = ends.set(get("openHead"), "opens", get("matchIndex"));
  const lastClosing = ends.get(get("closeHead"), "lastClose");
  const setFirstClosing = ends.set(get("closeHead"), "closes", get("matchIndex"));
  const setLastClosing = ends.set(get("closeHead"), "lastClose", get("matchIndex"));
  const appendEvent = () => wat`
    (local.set $event ${nextEvent})
    (local.set $eventCount (i32.add (local.get $eventCount) (i32.const 1)))
    (call ${charge} (i64.const ${event.size}))
    (if (local.get $last)
      (then ${connectLastEvent})
      (else (global.set ${first} (local.get $event))))
    (local.set $address ${currentEventAddress})
    ${clearEventNext}
    ${setEventStyle}
    ${setEventStart}
    ${setEventEnd}
    (if
      (i32.and
        (i32.ne (local.get $eventStyle) (i32.const ${kind.inlineText}))
        (i32.ne (local.get $eventStyle) (i32.const ${kind.delimiterRun})))
      (then (local.set $floor ${cursorPos("eventEnd")})))
    (local.set $last (local.get $event))`;
  const build = func(
    "buildAttention",
    () => wat`
      (param $input i32) (param $start i64) (param $limit i32) (param $out i32)
      (local $cursor i64) (local $gap i64) (local $atom i64) (local $after i64) (local $byte i32)
      (local $eventStart i64) (local $eventEnd i64) (local $eventStyle i32) (local $event i32)
      (local $last i32) (local $eventCount i32) (local $address i32) (local $count i32)
      (local $marker i32) (local $length i32) (local $node i32) (local $flags i32)
      (local $matches i32) (local $pair i32) (local $matchIndex i32) (local $depth i32) (local $brackets i32)
      (local $linkCount i32) (local $next i64) (local $linkAddress i32) (local $openHead i32)
      (local $closeHead i32) (local $tail i32) (local $entry i32) (local $floor i32)
      (local $autolink i64)
      (global.set ${first} (i32.const 0))
      (call ${links.reset})
      (call ${autolinks.reset})
      (call ${inline.html.reset})
      (global.set ${nodes} (global.get ${inline.runs}))
      (local.set $cursor (local.get $start))
      (local.set $gap (local.get $start))
      (block $collected (loop $collect
        (local.set $cursor
          (call ${inline.next} (local.get $input) (local.get $cursor) (local.get $limit)))
        (if
          (i32.eq
            (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit))
            (i32.const -1))
          (then
            (if (i32.lt_u ${cursorPos("gap")} ${cursorPos("cursor")})
              (then
                (local.set $eventStart (local.get $gap))
                (local.set $eventEnd (local.get $cursor))
                (local.set $eventStyle (i32.const ${kind.inlineText}))
                ${appendEvent()}))
            (br $collected)))
        (local.set $byte
          (call ${ranges.peek} (local.get $input) (local.get $cursor) (local.get $limit)))
        (local.set $after (call ${ranges.advance} (local.get $cursor) (local.get $limit)))
        (if
          (i32.or
            (i32.eq (local.get $byte) (i32.const ${charCode(".")}))
            (i32.or
              (i32.eq (local.get $byte) (i32.const ${charCode(":")}))
              (i32.eq (local.get $byte) (i32.const ${charCode("@")}))))
          (then
            ;; Literal autolinks aren't recognized inside a possible link label.
            (local.set $autolink (i64.const -1))
            (if (i32.eqz (global.get ${links.head}))
              (then
                (local.set $autolink
                  (call ${autolinks.candidate}
                    (local.get $input)
                    (local.get $cursor)
                    (local.get $floor)
                    (local.get $start)
                    (local.get $limit)))))
            (if (i64.eq (local.get $autolink) (i64.const -1))
              (then
                (local.set $cursor (local.get $after))
                (br $collect)))
            ;; Text and underscore runs before the stop may belong to the autolink: retract them.
            (local.set $atom (global.get ${autolinks.start}))
            (block $retracted (loop $retract
              (br_if $retracted (i32.eqz (local.get $eventCount)))
              (local.set $address (i32.add (global.get ${scratch.address}) ${previousEvent}))
              (br_if $retracted
                (i32.le_u
                  ${eventEndPosition}
                  ${cursorPos("atom")}))
              (if (i32.eq ${eventStyle} (i32.const ${kind.delimiterRun}))
                (then
                  (local.set $count (i32.sub (local.get $count) (i32.const 1)))
                  (local.set $depth (i32.sub (local.get $depth) (i32.const 1)))))
              (local.set $gap ${eventStart})
              (local.set $eventCount (i32.sub (local.get $eventCount) (i32.const 1)))
              (br $retract)))
            (local.set $last
              (if (result i32) (local.get $eventCount) (then ${previousEvent}) (else (i32.const 0))))
            (if (local.get $last)
              (then ${clearLastNext})
              (else (global.set ${first} (i32.const 0))))
            (if (i32.lt_u ${cursorPos("gap")} ${cursorPos("atom")})
              (then
                (local.set $eventStart (local.get $gap))
                (local.set $eventEnd (local.get $atom))
                (local.set $eventStyle (i32.const ${kind.inlineText}))
                ${appendEvent()}))
            (local.set $eventStart (local.get $atom))
            (local.set $eventEnd (local.get $autolink))
            (local.set $eventStyle ${uriStyle})
            ${appendEvent()}
            (local.set $cursor (local.get $autolink))
            (local.set $gap (local.get $cursor))
            (br $collect)))
        (if
          (i32.or
            (i32.or
              (i32.eq (local.get $byte) (i32.const ${charCode("[")}))
              (i32.eq (local.get $byte) (i32.const ${charCode("]")})))
            (i32.and
              (i32.eq (local.get $byte) (i32.const ${charCode("!")}))
              (i32.eq
                (call ${ranges.peek} (local.get $input) (local.get $after) (local.get $limit))
                (i32.const ${charCode("[")}))))
          (then
            (local.set $atom (local.get $cursor))
            (if (i32.eq (local.get $byte) (i32.const ${charCode("!")}))
              (then
                (local.set $after (call ${ranges.advance} (local.get $after) (local.get $limit)))))
            (global.set ${inline.end} (local.get $after))
            (global.set ${inline.style} (i32.const ${kind.inlineBracket})))
          (else
            (local.set $atom
              (call ${inline.parse}
                (local.get $input)
                (local.get $cursor)
                (local.get $limit)
                (local.get $out)))))
        (if (i64.eq (local.get $atom) (i64.const -1))
          (then
            (local.set $cursor (global.get ${inline.end}))
            (br $collect)))
        (if (i32.lt_u ${cursorPos("gap")} ${cursorPos("atom")})
          (then
            (local.set $eventStart (local.get $gap))
            (local.set $eventEnd (local.get $atom))
            (local.set $eventStyle (i32.const ${kind.inlineText}))
            ${appendEvent()}))
        (if (i32.eq (local.get $byte) (i32.const ${charCode("]")}))
          (then
            (local.set $next
              (call ${links.close}
                (local.get $input)
                (global.get ${scratch.address})
                (local.get $after)
                (local.get $limit)))
            (if (i64.ne (local.get $next) (i64.const -1))
              (then
                ;; The link's emphasis resolves inside it, and leaves the delimiter stack.
                (local.set $matches
                  (i32.add
                    (local.get $matches)
                    (call ${resolve}
                      (i32.add (global.get ${scratch.address}) (global.get ${nodes}))
                      (i32.add (global.get ${scratch.address}) (global.get ${inline.stack}))
                      (global.get ${links.delimiterBottom})
                      (local.get $depth)
                      (i32.add (global.get ${scratch.address}) (global.get ${inline.work}))
                      (i32.add (global.get ${scratch.address}) (global.get ${inline.bottoms}))
                      (i32.add
                        (global.get ${scratch.address})
                        ${inlineMatchAtCount}))))
                (local.set $depth (global.get ${links.delimiterBottom}))
                (local.set $address
                  (i32.add
                    (global.get ${scratch.address})
                    ${bracketEvent}))
                ${markLinkOpen}
                ${setLinkEventIndex}
                (local.set $linkAddress
                  (i32.add
                    (global.get ${scratch.address})
                    ${linkAtCount}))
                (if (global.get ${links.form})
                  (then ${clearLinkUri}
                    ${clearLinkTitle})
                  (else
                    ${setLinkUri}
                    ${setLinkTitleStart}
                    ${setLinkTitleEnd}))
                (local.set $eventStart (local.get $atom))
                (local.set $eventEnd (local.get $next))
                (local.set $eventStyle (i32.const ${kind.linkTail}))
                ${appendEvent()}
                ${setLinkEventIndex}
                (local.set $linkCount (i32.add (local.get $linkCount) (i32.const 1)))
                (local.set $cursor (local.get $next))
                (local.set $gap (local.get $cursor))
                (br $collect)))))
        (local.set $eventStart (local.get $atom))
        (local.set $eventEnd (global.get ${inline.end}))
        (local.set $eventStyle (global.get ${inline.style}))
        ${appendEvent()}
        (if
          (i32.and
            (i32.eq (local.get $eventStyle) (i32.const ${kind.inlineBracket}))
            (i32.ne (local.get $byte) (i32.const ${charCode("]")})))
          (then
            (local.set $entry
              (i32.add
                (global.get ${inline.brackets})
                (i32.mul (local.get $brackets) (i32.const ${bracket.size}))))
            (local.set $brackets (i32.add (local.get $brackets) (i32.const 1)))
            ;; An image's label starts at its "[", after the "!".
            (call ${links.push}
              (global.get ${scratch.address})
              (local.get $entry)
              (if (result i64) (i32.eq (local.get $byte) (i32.const ${charCode("!")}))
                (then (call ${ranges.advance} (local.get $eventStart) (local.get $limit)))
                (else (local.get $eventStart)))
              (i32.eq (local.get $byte) (i32.const ${charCode("!")}))
              (local.get $depth))
            ${setBracketEvent}))
        (if (i32.eq (local.get $eventStyle) (i32.const ${kind.delimiterRun}))
          (then
            (local.set $length
              (i32.sub ${cursorPos("eventEnd")} ${cursorPos("eventStart")}))
            (local.set $marker
              (call ${ranges.peek} (local.get $input) (local.get $eventStart) (local.get $limit)))
            (local.set $flags
              (call ${flanking}
                (call ${unicode.before}
                  (local.get $input)
                  (local.get $eventStart)
                  (local.get $start)
                  (local.get $limit))
                (call ${unicode.decode} (local.get $input) (local.get $eventEnd) (local.get $limit))
                (local.get $marker)))
            (if
              (i32.and
                (i32.eq (local.get $marker) (i32.const ${charCode("~")}))
                (i32.gt_u (local.get $length) (i32.const 2)))
              (then (local.set $flags (i32.const 0))))
            (local.set $node
              (i32.add
                (global.get ${scratch.address})
                ${runAtCount}))
            ${setRunPosition}
            ${setRunLength}
            ${setRunMarker}
            ${setRunFlags}
            ${setDelimiterEventIndex}
            ${pushDelimiter}
            (local.set $depth (i32.add (local.get $depth) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))
        (local.set $cursor (local.get $eventEnd))
        (local.set $gap (local.get $cursor))
        (br $collect)))
      (global.set ${heads} (global.get ${inline.heads}))
      (global.set ${pairs} (global.get ${inline.matches}))
      (call ${charge} (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${ends.size})))
      (memory.fill
        (i32.add (global.get ${scratch.address}) (global.get ${heads}))
        (i32.const 255)
        (i32.mul (local.get $count) (i32.const ${ends.size})))
      (local.set $matches
        (i32.add
          (local.get $matches)
          (call ${resolve}
            (i32.add (global.get ${scratch.address}) (global.get ${nodes}))
            (i32.add (global.get ${scratch.address}) (global.get ${inline.stack}))
            (i32.const 0)
            (local.get $depth)
            (i32.add (global.get ${scratch.address}) (global.get ${inline.work}))
            (i32.add (global.get ${scratch.address}) (global.get ${inline.bottoms}))
            (i32.add
              (global.get ${scratch.address})
              ${matchAtCount}))))
      (local.set $matchIndex (i32.const 0))
      (block $linked (loop $link
        (br_if $linked (i32.ge_u (local.get $matchIndex) (local.get $matches)))
        (call ${charge} (i64.const 1))
        (local.set $pair
          (i32.add
            (global.get ${scratch.address})
            ${matchAtIndex}))
        (local.set $openHead
          (i32.add
            (global.get ${scratch.address})
            ${openingHead}))
        (local.set $closeHead
          (i32.add
            (global.get ${scratch.address})
            ${closingHead}))
        ${linkNextOpening}
        ${setFirstOpening}
        ${clearNextClosing}
        (local.set $tail ${lastClosing})
        (if (i32.eq (local.get $tail) (i32.const -1))
          (then ${setFirstClosing})
          (else
            ${linkClosingTail}))
        ${setLastClosing}
        (local.set $matchIndex (i32.add (local.get $matchIndex) (i32.const 1)))
        (br $link)))`,
  );
  return { build, first, nodes, pairs, heads };
}
