import { kindOf, record } from "./records.ts";

export function checkRecords(words: Uint32Array, documents: Uint32Array, injections: number): void {
  if (words.length % 2) throw new Error("Odd record word count");
  if (documents.length % 2) throw new Error("Odd document word count");

  let openedInjections = 0;
  let documentIndex = 0;
  let position = documents[0] ?? 0;
  let previousStyle = -1;
  const groups: { start: number; end: number }[] = [];

  for (let index = 0; index < words.length; index += 2) {
    const a = words[index]!;
    const word = words[index + 1]!;
    const kind = kindOf(word);
    const payload = word & record.injectionMask;

    if (kind === "opensStatic" || kind === "opensNamed") {
      if (payload !== openedInjections || payload >= injections)
        throw new Error("Invalid injection open order");
      openedInjections++;

      if (kind === "opensNamed") {
        if (a !== 0 || index + 3 >= words.length) throw new Error("Invalid named open");
        index += 2;
      }
      continue;
    }

    if (
      kind !== "group" &&
      documentIndex < documents.length &&
      position === documents[documentIndex + 1]
    ) {
      documentIndex += 2;
      position = documents[documentIndex] ?? position;
      groups.length = 0;
      previousStyle = -1;
    }
    if (documentIndex >= documents.length) throw new Error("Records outside documents");

    if (kind === "group") {
      if (a < documents[documentIndex]!) throw new Error("group outside document");
      if (a >= position) throw new Error("empty group");

      while (groups.length && groups[groups.length - 1]!.start >= a) groups.pop();
      if (groups.length && groups[groups.length - 1]!.end > a) throw new Error("crossing groups");

      groups.push({ start: a, end: position });
      previousStyle = -1;
      continue;
    }

    if (a <= position) throw new Error("Invalid record tiling");
    if (a > documents[documentIndex + 1]!) throw new Error("Record crosses its end");

    if (kind === "span") {
      if (previousStyle === payload) throw new Error("Adjacent spans have same style");
      previousStyle = payload;
    } else {
      if (payload >= openedInjections) throw new Error("Injection segment before open");
      previousStyle = -1;
    }
    position = a;
  }

  if (
    documents.length &&
    (documentIndex !== documents.length - 2 || position !== documents[documentIndex + 1])
  )
    throw new Error("Records do not cover documents");
  if (openedInjections !== injections) throw new Error("Missing injection opens");
}
