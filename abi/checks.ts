import { kindOf } from "./records.ts";
import { record } from "./constants.ts";

/** Verify tiling, group nesting, merging, and injection ordering (docs/abi.md). */
export function checkRecords(words: Uint32Array, ranges: Uint32Array, injections: number): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid output records: ${message}`);
  };
  if (words.length % 2) fail("odd word count");
  let range = 0;
  let position = ranges[0] ?? 0;
  let previousStyle: number | undefined;
  let opened = 0;
  const groups: { start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += 2) {
    const value = words[i]!;
    const word = words[i + 1]!;
    const kind = kindOf(word);
    const id = word & record.injectionMask;
    if (kind === "opensStatic" || kind === "opensNamed") {
      if (id !== opened++) fail("opens must be in injection order");
      if (kind === "opensNamed") {
        if (value !== 0 || i + 3 >= words.length) fail("malformed named open");
        i += 2;
      }
      continue;
    }
    if (kind === "group") {
      if (range >= ranges.length / 2 || value < ranges[range * 2]! || value >= position)
        fail("group start outside range or empty group");
      while (groups.length && groups[groups.length - 1]!.start >= value) groups.pop();
      if (groups.length && groups[groups.length - 1]!.end > value) fail("crossing groups");
      groups.push({ start: value, end: position });
      previousStyle = undefined;
      continue;
    }
    if (range < ranges.length / 2 && position === ranges[range * 2 + 1]) {
      range++;
      position = ranges[range * 2] ?? position;
      previousStyle = undefined;
      groups.length = 0;
    }
    if (range >= ranges.length / 2) fail("record past final range");
    if (value <= position || value > ranges[range * 2 + 1]!)
      fail("record does not tile its range or crosses its end");
    if (kind === "span") {
      if (previousStyle === word) fail("adjacent spans have the same style");
      previousStyle = word;
    } else {
      if (id >= opened) fail("injection segment before open");
      previousStyle = undefined;
    }
    position = value;
  }
  if (range < ranges.length / 2 && position === ranges[range * 2 + 1]) range++;
  if (range !== ranges.length / 2) fail("records do not cover their ranges");
  if (opened !== injections) fail("injection count differs from opens");
}
