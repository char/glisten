import type { OutputRecord } from "#/abi/mod.ts";

/** A half-open range in the original source. */
export type SourceRange = { readonly start: number; readonly end: number };

/** One logical document and the correspondence between its bytes and source ranges. */
export type Document = {
  readonly bytes: Uint8Array;
  readonly pieces: readonly SourceRange[];
  /** Map a logical half-open range back to the source, retaining piece boundaries. */
  mapRange(start: number, end: number): SourceRange[];
};

export function validatePieces(pieces: readonly SourceRange[], sourceLength: number): number {
  if (!pieces.length) throw new RangeError("A document must contain at least one piece");
  let length = 0;
  let previousEnd = 0;
  for (const { start, end } of pieces) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < previousEnd ||
      end <= start ||
      end > sourceLength
    )
      throw new RangeError("Invalid document pieces");
    length += end - start;
    if (!Number.isSafeInteger(length)) throw new RangeError("Document is too long");
    previousEnd = end;
  }
  return length;
}

/** Join source pieces, or use an existing joined buffer supplied as a fresh-view accessor. */
export function document(
  source: Uint8Array,
  pieces: readonly SourceRange[],
  joined?: () => Uint8Array,
): Document {
  const length = validatePieces(pieces, source.length);
  let offset = 0;
  const ends: number[] = [];
  const saved: SourceRange[] = [];
  for (const { start, end } of pieces) {
    offset += end - start;
    saved.push({ start, end });
    ends.push(offset);
  }
  let bytes: Uint8Array | undefined;
  if (!joined && saved.length === 1) {
    const { start, end } = saved[0]!;
    bytes = source.subarray(start, end);
  } else if (!joined) {
    bytes = new Uint8Array(length);
    let at = 0;
    for (const { start, end } of saved) {
      bytes.set(source.subarray(start, end), at);
      at += end - start;
    }
  }
  return {
    get bytes() {
      const view = joined ? joined() : bytes!;
      if (view.length !== length) throw new RangeError("Joined document has the wrong length");
      return view;
    },
    pieces: saved,
    mapRange(start, end) {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        end > length
      )
        throw new RangeError("Invalid document range");
      if (start === end) return [];
      const mapped: SourceRange[] = [];
      let low = 0;
      let high = ends.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (ends[middle]! <= start) low = middle + 1;
        else high = middle;
      }
      let base = low ? ends[low - 1]! : 0;
      for (let index = low; index < saved.length; index++) {
        const piece = saved[index]!;
        const limit = ends[index]!;
        if (start < limit && end > base) {
          mapped.push({
            start: piece.start + Math.max(start - base, 0),
            end: piece.start + Math.min(end - base, limit - base),
          });
        }
        if (limit >= end) break;
        base = limit;
      }
      return mapped;
    },
  };
}

/** Named opens retain logical bytes: their name can cross a source gap. */
export type MappedRecord =
  | Exclude<OutputRecord, { kind: "opens"; name: readonly [number, number] }>
  | { kind: "opens"; injection: number; name: Uint8Array };

/** Map records from a document in an input buffer back to source pieces. */
export function mapDocumentRecords(
  doc: Document,
  records: readonly OutputRecord[],
  inputStart = 0,
): MappedRecord[] {
  if (!Number.isSafeInteger(inputStart) || inputStart < 0)
    throw new RangeError("Invalid document input offset");
  const mapped: MappedRecord[] = [];
  let position = inputStart;
  for (const record of records) {
    if (record.kind === "opens") {
      if ("embeds" in record) mapped.push(record);
      else {
        const start = record.name[0] - inputStart;
        const end = record.name[1] - inputStart;
        doc.mapRange(start, end);
        mapped.push({
          kind: "opens",
          injection: record.injection,
          name: doc.bytes.subarray(start, end),
        });
      }
      continue;
    }
    if (record.kind === "group") throw new Error("Group mapping is not yet implemented");
    if (record.end <= position) throw new RangeError("Empty or out-of-order record");
    const ranges = doc.mapRange(position - inputStart, record.end - inputStart);
    for (const [index, range] of ranges.entries()) {
      if (record.kind === "span") mapped.push({ ...record, end: range.end });
      else
        mapped.push({
          ...record,
          end: range.end,
          closes: record.closes && index === ranges.length - 1,
        });
    }
    position = record.end;
  }
  if (position - inputStart !== doc.bytes.length)
    throw new RangeError("Records do not cover document");
  return mapped;
}
