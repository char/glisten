import type { CallContext } from "./engine.ts";
import { document, validatePieces, type Document, type SourceRange } from "./documents.ts";

/** Documents and their offsets in the input presented to a callee. */
export type DocumentBatch = {
  readonly context: CallContext;
  readonly ranges: Uint32Array;
  readonly maps: readonly Document[];
};

/** Prepare a batch of documents while retaining the original source coordinates. */
export function prepareDocumentBatch(
  input: CallContext,
  pieces: readonly (readonly SourceRange[])[],
  lazyMaps = false,
): DocumentBatch {
  let context = input;
  const ranges = new Uint32Array(pieces.length * 2);
  const source = input.source();
  for (const parts of pieces) {
    validatePieces(parts, source.length);
    if (parts[parts.length - 1]!.end > 0xffff_ffff)
      throw new RangeError("Document batch exceeds ABI input range");
  }
  let maps: readonly Document[] | undefined;
  if (input.placement) {
    for (let i = 0; i < pieces.length; i++) {
      const joined = input.placement.arena.join(context, pieces[i]!);
      context = joined.context;
      if (joined.range.end > 0xffff_ffff)
        throw new RangeError("Document batch exceeds ABI input range");
      ranges[i * 2] = joined.range.start;
      ranges[i * 2 + 1] = joined.range.end;
    }
  } else if (pieces.some((parts) => parts.length > 1)) {
    let length = source.length;
    for (const parts of pieces) {
      if (parts.length === 1) continue;
      for (const { start, end } of parts) length += end - start;
    }
    if (length > 0xffff_ffff) throw new RangeError("Document batch exceeds ABI input range");
    const bytes = new Uint8Array(length);
    bytes.set(source);
    let cursor = source.length;
    for (let i = 0; i < pieces.length; i++) {
      const parts = pieces[i]!;
      if (parts.length === 1) {
        ranges[i * 2] = parts[0]!.start;
        ranges[i * 2 + 1] = parts[0]!.end;
      } else {
        ranges[i * 2] = cursor;
        for (const part of parts) {
          bytes.set(source.subarray(part.start, part.end), cursor);
          cursor += part.end - part.start;
        }
        ranges[i * 2 + 1] = cursor;
      }
    }
    context = { source: () => bytes };
  } else {
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]![0]!;
      ranges[i * 2] = piece.start;
      ranges[i * 2 + 1] = piece.end;
    }
  }
  const batch: DocumentBatch = {
    context,
    ranges,
    get maps() {
      return (maps ??= pieces.map((parts, index) =>
        document(input.source(), parts, () =>
          context.source().subarray(ranges[index * 2]!, ranges[index * 2 + 1]!),
        ),
      ));
    },
  };
  if (!lazyMaps) void batch.maps;
  return batch;
}
