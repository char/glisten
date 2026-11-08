import { record, segment } from "#/abi/mod.ts";
import type { Callee, CallContext } from "./engine.ts";
import { Names } from "./names.ts";
import { Spans } from "./spans.ts";

// Segment triples are [source start, source end, document-boundary flags].
type Batch = { target: Callee; segments: Uint32Array; buffer: Uint32Array<ArrayBuffer> };

/**
 * Frames belong to one live call each, including siblings awaiting emission.
 * A lease lasts through emission; nested compositions take later frames and restore
 * the cursor on exit. Buffers retain capacity but their contents are reset on reuse.
 */
export class Scratch {
  private readonly frames: Frame[] = [];
  private readonly outputs: Spans[] = [];
  private cursor = 0;

  /** Save the cursor before leasing frames for a composition. */
  mark(): number {
    return this.cursor;
  }

  /** Lease a distinct frame until the enclosing composition releases its mark. */
  next(): Frame {
    const index = this.cursor++;
    return this.frames[index] ?? (this.frames[index] = new Frame());
  }

  /** Lease an output buffer; borrowed spans remain valid until this mark is reused. */
  output(mark: number): Spans {
    const spans = this.outputs[mark] ?? (this.outputs[mark] = new Spans());
    spans.reset();
    return spans;
  }

  /** Release all frames leased since this mark, including after a nested composition. */
  release(mark: number): void {
    this.cursor = mark;
  }
}

function grow(buffer: Uint32Array<ArrayBuffer>, length: number): Uint32Array<ArrayBuffer> {
  if (buffer.length >= length) return buffer;
  return new Uint32Array(Math.max(length, buffer.length * 4, 1));
}

class Frame {
  // Scan: [word start, word end, first ordinal] by input segment; counts by injection.
  // Data: [injection, start, end, flags] by segment ordinal; length counts segment records.
  ranges = new Uint32Array();
  counts = new Uint32Array();
  data = new Uint32Array();
  length = 0;
  injectionCount = 0;
  singleSegments = false;

  // Resolution: targets by injection, cached static targets by embed index, and named targets by name.
  targets: (Callee | null)[] = [];
  staticTargets: (Callee | null)[] = [];
  namedTargets?: Map<string, Callee | null>;
  decoder?: TextDecoder;

  // Grouping: groups and offset cursors by injection; targets and sizes by group, with a target-to-group cache.
  groups = new Uint32Array();
  offsets = new Uint32Array();
  groupTargets: Callee[] = [];
  sizes: number[] = [];
  byTarget?: Map<Callee, number>;

  // Batches: reusable segment buffers and their target, indexed by group.
  batches: Batch[] = [];

  // Links: child and child-range indices by parent segment ordinal, backed by reusable buffers.
  childBuffer = new Int32Array();
  rangeBuffer = new Uint32Array();
  linkChildren?: Int32Array;
  linkRanges?: Uint32Array;

  resetResolution(): void {
    this.targets.length = 0;
    this.staticTargets.length = 0;
    this.namedTargets?.clear();
  }

  resolve(
    kind: number,
    end: number,
    words: Uint32Array,
    index: number,
    callee: Callee,
    context: CallContext,
    names: Names<Callee>,
    missing: Set<string>,
  ): Callee | null {
    let name: string;
    let target: Callee | null | undefined;
    if (kind === record.kind.opensStatic) {
      name = callee.manifest.embeds[end] ?? "";
      target = this.staticTargets[end];
      if (target === undefined) {
        target = names.get(name) ?? null;
        this.staticTargets[end] = target;
      }
    } else {
      name = (this.decoder ??= new TextDecoder()).decode(
        context.source().subarray(words[index + 2]!, words[index + 3]!),
      );
      const cache = (this.namedTargets ??= new Map());
      target = cache.get(name);
      if (target === undefined) {
        target = names.get(name) ?? null;
        cache.set(name, target);
      }
    }
    if (!target && name) missing.add(name);
    return target;
  }
}

/** Scan once, collecting injection segments and input-segment record ranges. */
export function scan(
  words: Uint32Array,
  segments: Uint32Array,
  count: number,
  callee: Callee,
  context: CallContext,
  names: Names<Callee>,
  missing: Set<string>,
  frame = new Frame(),
  wholeWithoutGroups = false,
): Frame {
  frame.ranges = grow(frame.ranges, segments.length);
  frame.counts = grow(frame.counts, count);
  frame.counts.fill(0, 0, count);
  frame.resetResolution();
  frame.length = 0;
  frame.injectionCount = count;
  frame.singleSegments = wholeWithoutGroups;
  let data = frame.data;
  let length = 0;
  let current = 0;
  let position = segments[0]!;
  let rangeStart = 0;
  let rangeOrdinal = 0;
  const finishRange = (end: number) => {
    frame.ranges[current * 3] = rangeStart;
    frame.ranges[current * 3 + 1] = end;
    frame.ranges[current * 3 + 2] = rangeOrdinal;
    rangeStart = end;
    rangeOrdinal = length;
    current++;
    position = segments[current * 3] ?? position;
  };
  for (let i = 0; i < words.length; i += 2) {
    const end = words[i]!;
    const word = words[i + 1]!;
    const kind = word >>> record.kindShift;
    // A whole root without groups has no intermediate input boundary to finish.
    if (wholeWithoutGroups && kind === record.kind.span) {
      position = end;
      continue;
    }
    // An open followed by a group belongs to the current range, even at its end.
    const nextRecord = i + (kind === record.kind.opensNamed ? 4 : 2);
    const groupAfterOpen =
      (kind === record.kind.opensStatic || kind === record.kind.opensNamed) &&
      nextRecord + 1 < words.length &&
      words[nextRecord + 1]! >>> record.kindShift === record.kind.group;
    if (kind !== record.kind.group && !groupAfterOpen && position === segments[current * 3 + 1])
      finishRange(i);
    if (kind === record.kind.group) {
      frame.singleSegments = false;
      continue;
    }
    const id = word & record.injectionMask;
    if (kind === record.kind.opensStatic || kind === record.kind.opensNamed) {
      frame.targets[id] = frame.resolve(kind, end, words, i, callee, context, names, missing);
      if (kind === record.kind.opensNamed) i += 2;
      continue;
    }
    if (kind === record.kind.segment || kind === record.kind.segmentCloses) {
      if (frame.counts[id] || kind !== record.kind.segmentCloses) frame.singleSegments = false;
      const offset = length * 4;
      if (offset + 4 > data.length) {
        const grown = grow(data, offset + 4);
        grown.set(data);
        data = grown;
      }
      data[offset] = id;
      data[offset + 1] = position;
      data[offset + 2] = end;
      data[offset + 3] =
        (frame.counts[id] ? 0 : segment.starts) |
        (kind === record.kind.segmentCloses ? segment.ends : 0);
      frame.counts[id] = frame.counts[id]! + 1;
      length++;
    }
    position = end;
  }
  if (position === segments[current * 3 + 1]) finishRange(words.length);
  frame.data = data;
  frame.length = length;
  return frame;
}

/** Find each input segment's record range when a call has no injections. */
export function recordRanges(
  words: Uint32Array,
  segments: Uint32Array,
  frame = new Frame(),
): Uint32Array {
  const ranges = (frame.ranges = grow(frame.ranges, segments.length));
  if (segments.length === 3) {
    ranges[0] = 0;
    ranges[1] = words.length;
    ranges[2] = 0;
    return ranges;
  }
  let current = 0;
  let start = 0;
  for (let i = 0; i < words.length; i += 2) {
    if (
      words[i + 1]! >>> record.kindShift !== record.kind.group &&
      words[i] === segments[current * 3 + 1]
    ) {
      while (i + 2 < words.length && words[i + 3]! >>> record.kindShift === record.kind.group)
        i += 2;
      ranges[current * 3] = start;
      ranges[current * 3 + 1] = i + 2;
      ranges[current * 3 + 2] = 0;
      start = i + 2;
      current++;
    }
  }
  return ranges;
}

/** Group injections by target and prefix-sum their offsets in injection order. */
export function group(scan: Frame): Frame {
  const count = scan.injectionCount;
  scan.groups = grow(scan.groups, count);
  scan.offsets = grow(scan.offsets, count);
  const targets = scan.groupTargets;
  const sizes = scan.sizes;
  targets.length = 0;
  sizes.length = 0;
  // Small batches are cheaper to search linearly than to populate a map.
  const byTarget = count > 16 ? (scan.byTarget ??= new Map()) : undefined;
  byTarget?.clear();
  for (let id = 0; id < count; id++) {
    const target = scan.targets[id];
    if (!target) continue;
    let index = byTarget ? byTarget.get(target) : targets.indexOf(target);
    if (index === undefined || index < 0) {
      index = targets.length;
      byTarget?.set(target, index);
      targets.push(target);
      sizes.push(0);
    }
    scan.groups[id] = index;
    scan.offsets[id] = sizes[index]!;
    sizes[index] = sizes[index]! + scan.counts[id]!;
  }
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!;
    const size = sizes[index]! * 3;
    let batch = scan.batches[index];
    if (!batch) {
      batch = { target, buffer: new Uint32Array(size), segments: new Uint32Array() };
      scan.batches[index] = batch;
    }
    batch.target = target;
    batch.buffer = grow(batch.buffer, size);
    if (batch.segments.length !== size || batch.segments.buffer !== batch.buffer.buffer)
      batch.segments = batch.buffer.length === size ? batch.buffer : batch.buffer.subarray(0, size);
  }
  scan.batches.length = targets.length;
  return scan;
}

/** Write segment triples directly to their target batches and index parent links. */
export function writeBatches(scan: Frame, result: Frame): Frame {
  if (!result.batches.length) {
    result.linkChildren = undefined;
    result.linkRanges = undefined;
    return result;
  }
  if (result.childBuffer.length < scan.length)
    result.childBuffer = new Int32Array(Math.max(scan.length, result.childBuffer.length * 4));
  result.rangeBuffer = grow(result.rangeBuffer, scan.length);
  const linkChildren = result.childBuffer;
  const linkRanges = result.rangeBuffer;
  linkChildren.fill(-1, 0, scan.length);
  for (let i = 0; i < scan.length; i++) {
    const offset = i * 4;
    const id = scan.data[offset]!;
    if (!scan.targets[id]) continue;
    const batchIndex = result.groups[id]!;
    const segmentIndex = result.offsets[id]!++;
    const segments = result.batches[batchIndex]!.segments;
    segments[segmentIndex * 3] = scan.data[offset + 1]!;
    segments[segmentIndex * 3 + 1] = scan.data[offset + 2]!;
    segments[segmentIndex * 3 + 2] = scan.data[offset + 3]!;
    linkChildren[i] = batchIndex;
    linkRanges[i] = segmentIndex;
  }
  result.linkChildren = linkChildren;
  result.linkRanges = linkRanges;
  return result;
}
