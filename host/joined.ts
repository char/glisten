import { checkRecords, record, segment } from "#/abi/mod.ts";
import { prepareDocumentBatch } from "./document_batch.ts";
import type { SourceRange } from "./documents.ts";
import type { Callee, CallContext, CallResult } from "./engine.ts";
import { ResourceError } from "./memory.ts";

/** Reused layout for a child call over one contiguous document. */
const single = new Uint32Array(2);

/** Invoke a callee on contiguous documents and map its records onto source pieces. */
export function callJoined(
  callee: Callee,
  context: CallContext,
  segments: Uint32Array,
  checks = false,
): { result: CallResult; context: CallContext } {
  let split = false;
  for (let i = 2; i < segments.length; i += 3)
    if (segments[i] !== (segment.starts | segment.ends)) split = true;
  if (!split) {
    // Callees consume their documents during the call, so the common one-document
    // case reuses a buffer rather than allocating per call.
    let documents: Uint32Array;
    if (segments.length === 3) {
      single[0] = segments[0]!;
      single[1] = segments[1]!;
      documents = single;
    } else documents = segmentRanges(segments);
    const result = callee.call(context, documents);
    if (checks && result.status === "ok")
      checkRecords(result.records(), documents, result.injections);
    return { result, context };
  }

  const documents: SourceRange[][] = [];
  for (let i = 0; i < segments.length; i += 3) {
    const flags = segments[i + 2]!;
    if (flags & segment.starts) documents.push([]);
    const current = documents.at(-1);
    if (!current) throw new Error("First segment must start a document");
    current.push({ start: segments[i]!, end: segments[i + 1]! });
  }
  let batch: ReturnType<typeof prepareDocumentBatch>;
  try {
    batch = prepareDocumentBatch(context, documents, true);
  } catch (error) {
    if (error instanceof ResourceError) return { result: { status: "resource" }, context };
    throw error;
  }
  const layout = batch.ranges;
  const result = callee.call(batch.context, layout);
  if (result.status === "resource") return { result, context: batch.context };
  const words = result.records();
  if (checks) checkRecords(words, layout, result.injections);
  if (!result.groups) {
    // Each piece boundary can split at most one consuming record.
    const output = new Uint32Array(words.length + segments.length * 2);
    let used = 0;
    let doc = 0;
    let piece = 0;
    let base = layout[0]!;
    let position = base;
    let part = documents[0]![0]!;
    let limit = base + part.end - part.start;
    for (let i = 0; i < words.length; i += 2) {
      const end = words[i]!;
      const word = words[i + 1]!;
      const kind = word >>> record.kindShift;
      if (kind === record.kind.opensStatic || kind === record.kind.opensNamed) {
        output[used++] = end;
        output[used++] = word;
        if (kind === record.kind.opensNamed) {
          const nameStart = words[i + 2]!;
          const nameEnd = words[i + 3]!;
          let owner = Math.min(doc, documents.length - 1);
          if (
            position === layout[doc * 2 + 1] &&
            doc + 1 < documents.length &&
            nameStart >= layout[(doc + 1) * 2]! &&
            nameEnd <= layout[(doc + 1) * 2 + 1]!
          )
            owner++;
          const start = layout[owner * 2]!;
          const stop = layout[owner * 2 + 1]!;
          const name =
            start <= nameStart && nameStart < nameEnd && nameEnd <= stop
              ? batch.maps[owner]!.mapRange(nameStart - start, nameEnd - start)
              : [];
          output[used++] = name.length === 1 ? name[0]!.start : nameStart;
          output[used++] = name.length === 1 ? name[0]!.end : nameEnd;
          i += 2;
        }
        continue;
      }
      if (position === layout[doc * 2 + 1]) {
        doc++;
        piece = 0;
        base = layout[doc * 2]!;
        position = base;
        part = documents[doc]![0]!;
        limit = base + part.end - part.start;
      }
      while (position < end) {
        if (position === limit) {
          base = limit;
          part = documents[doc]![++piece]!;
          limit = base + part.end - part.start;
        }
        const next = Math.min(end, limit);
        const start = part.start + position - base;
        const mappedEnd = part.start + next - base;
        const mappedWord =
          kind === record.kind.segmentCloses && next < end ? word & ~(1 << record.kindShift) : word;
        if (
          kind === record.kind.span &&
          used >= 2 &&
          output[used - 1] === mappedWord &&
          output[used - 2] === start &&
          start !== part.start
        )
          output[used - 2] = mappedEnd;
        else {
          output[used++] = mappedEnd;
          output[used++] = mappedWord;
        }
        position = next;
      }
    }
    const records = output.subarray(0, used);
    return {
      result: { status: "ok", injections: result.injections, groups: 0, records: () => records },
      context: batch.context,
    };
  }
  // Group records follow the spans they cover. Fragment them at piece boundaries,
  // then insert each fragment after the mapped record ending at that boundary.
  const mapped: number[] = [];
  const endpoints: Map<number, number>[] = [];
  const pendingGroups: { doc: number; end: number; start: number; word: number; value?: string }[] =
    [];
  let doc = 0;
  let position = layout[0]!;
  for (let i = 0; i < words.length; i += 2) {
    const end = words[i]!;
    const word = words[i + 1]!;
    const kind = word >>> record.kindShift;
    if (
      kind !== record.kind.group &&
      kind !== record.kind.opensStatic &&
      kind !== record.kind.opensNamed &&
      position === layout[doc * 2 + 1]
    ) {
      doc++;
      position = layout[doc * 2] ?? position;
    }
    if (kind === record.kind.group) {
      const start = layout[doc * 2]!;
      const ranges = batch.maps[doc]!.mapRange(end - start, position - start);
      const value =
        ranges.length > 1
          ? new TextDecoder().decode(batch.context.source().subarray(end, position))
          : undefined;
      for (const range of ranges)
        pendingGroups.push({
          doc,
          end: range.end,
          start: range.start,
          word,
          value,
        });
      continue;
    }
    if (kind === record.kind.opensStatic || kind === record.kind.opensNamed) {
      mapped.push(end, word);
      if (kind === record.kind.opensNamed) {
        // A name within one piece maps to the source; one spanning a gap stays in the joined
        // input, which every joined context still exposes after the original source.
        const [nameStart, nameEnd] = [words[i + 2]!, words[i + 3]!];
        let owner = Math.min(doc, documents.length - 1);
        if (
          position === layout[doc * 2 + 1] &&
          doc + 1 < documents.length &&
          nameStart >= layout[(doc + 1) * 2]! &&
          nameEnd <= layout[(doc + 1) * 2 + 1]!
        )
          owner++;
        const [start, end] = [layout[owner * 2]!, layout[owner * 2 + 1]!];
        const name =
          start <= nameStart && nameStart < nameEnd && nameEnd <= end
            ? batch.maps[owner]!.mapRange(nameStart - start, nameEnd - start)
            : [];
        if (name.length === 1) mapped.push(name[0]!.start, name[0]!.end);
        else mapped.push(nameStart, nameEnd);
        i += 2;
      }
      continue;
    }
    const start = layout[doc * 2]!;
    const ranges = batch.maps[doc]!.mapRange(position - start, end - start);
    for (const [index, range] of ranges.entries()) {
      const mappedWord =
        kind === record.kind.segmentCloses && index < ranges.length - 1
          ? word & ~(1 << record.kindShift)
          : word;
      mapped.push(range.end, mappedWord);
      (endpoints[doc] ??= new Map()).set(range.end, mapped.length);
    }
    position = end;
  }
  if (!pendingGroups.length) {
    const records = Uint32Array.from(mapped);
    return {
      result: { status: "ok", injections: result.injections, groups: 0, records: () => records },
      context: batch.context,
    };
  }
  const inserts = new Map<number, typeof pendingGroups>();
  for (const group of pendingGroups) {
    const at = endpoints[group.doc]?.get(group.end);
    if (at === undefined) throw new Error("Group fragment has no matching tiling boundary");
    const list = inserts.get(at) ?? [];
    list.push(group);
    inserts.set(at, list);
  }
  const output: number[] = [];
  const groupValues = new Map<number, string>();
  for (let i = 0; i < mapped.length; i += 2) {
    output.push(mapped[i]!, mapped[i + 1]!);
    const list = inserts.get(i + 2);
    if (list) {
      list.sort((a, b) => b.start - a.start);
      for (const group of list) {
        if (group.value !== undefined) groupValues.set(output.length, group.value);
        output.push(group.start, group.word);
      }
    }
  }
  const records = Uint32Array.from(output);
  return {
    result: {
      status: "ok",
      injections: result.injections,
      groups: pendingGroups.length,
      groupValues,
      records: () => records,
    },
    context: batch.context,
  };
}

/** Drop the flags from host segments, leaving `[start, end]` pairs. */
export function segmentRanges(segments: Uint32Array): Uint32Array {
  const ranges = new Uint32Array((segments.length / 3) * 2);
  for (let i = 0, j = 0; i < segments.length; i += 3, j += 2) {
    ranges[j] = segments[i]!;
    ranges[j + 1] = segments[i + 1]!;
  }
  return ranges;
}
