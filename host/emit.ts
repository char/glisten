import { record } from "#/abi/mod.ts";
import type { CallResult } from "./engine.ts";
import type { Spans } from "./spans.ts";

export type Call = {
  result: Extract<CallResult, { status: "ok" }>;
  words: Uint32Array;
  ranges: Uint32Array;
  children: Call[];
  hasGroups: boolean;
  // Indexed by segment-record ordinal; -1 denotes an unlinked segment.
  linkChildren?: Int32Array;
  linkRanges?: Uint32Array;
};

/** Splice single-segment, group-free leaves without recursive emission. */
export function emitSingles(call: Call, spans: Spans, missingStyle: number): void {
  const words = call.words;
  let ordinal = 0;
  for (let i = 0; i < words.length; i += 2) {
    const word = words[i + 1]!;
    const kind = word >>> record.kindShift;
    if (kind === record.kind.span) {
      const first = i;
      while (i + 2 < words.length && words[i + 3]! >>> record.kindShift === record.kind.span)
        i += 2;
      spans.append(words, first, i + 2);
    } else if (kind === record.kind.segmentCloses) {
      const childIndex = call.linkChildren?.[ordinal] ?? -1;
      if (childIndex < 0) spans.push(words[i]!, missingStyle);
      else {
        const child = call.children[childIndex]!;
        const offset = call.linkRanges![ordinal]! * 3;
        const start = child.ranges[offset]!;
        spans.append(child.words, start, child.ranges[offset + 1]!);
      }
      ordinal++;
    } else if (kind === record.kind.opensNamed) i += 2;
  }
}

/** Emit a planned record range, recursively substituting linked child ranges. */
export function emit(
  call: Call,
  start: number,
  end: number,
  ordinal: number,
  spans: Spans,
  missingStyle: number,
  groups: number[],
  values: (string | undefined)[],
): void {
  const words = call.words;
  for (let i = start; i < end; i += 2) {
    const word = words[i + 1]!;
    const kind = word >>> record.kindShift;
    if (kind === record.kind.span) {
      const first = i;
      while (i + 2 < end && words[i + 3]! >>> record.kindShift === record.kind.span) i += 2;
      spans.append(words, first, i + 2);
    } else if (kind === record.kind.group) {
      groups.push(words[i]!, spans.end, word & record.styleMask);
      values.push(call.result.groupValues?.get(i));
    } else if (kind === record.kind.segment || kind === record.kind.segmentCloses) {
      const childIndex = call.linkChildren?.[ordinal] ?? -1;
      if (childIndex < 0) spans.push(words[i]!, missingStyle);
      else {
        const child = call.children[childIndex]!;
        const offset = call.linkRanges![ordinal]! * 3;
        const from = child.ranges[offset]!;
        const to = child.ranges[offset + 1]!;
        // A leaf child's records are already a tiling, so splice them without recursing.
        if (child.result.injections || child.hasGroups)
          emit(child, from, to, child.ranges[offset + 2]!, spans, missingStyle, groups, values);
        else spans.append(child.words, from, to);
      }
      ordinal++;
    } else if (kind === record.kind.opensNamed) i += 2;
  }
}
