import { record } from "#/abi/mod.ts";
import type { CallResult } from "./engine.ts";

/**
 * Extract a single document's postorder groups without allocating per-group objects,
 * compacting the remaining spans in place (the records belong to this call).
 */
export function extractGroups(
  result: Extract<CallResult, { status: "ok" }>,
  words: Uint32Array,
  copySpans: boolean,
): { spans: Uint32Array; groups: Uint32Array; values?: (string | undefined)[] } {
  const count = result.groups!;
  // Nodes are [start, end, style, first child, next sibling]. Links and stack
  // entries are one-based, leaving zero as the empty link.
  const nodes = new Uint32Array(count * 5);
  const stack = new Uint32Array(count);
  const sourceValues = result.groupValues;
  const values = sourceValues?.size ? new Array<string | undefined>(count) : undefined;
  let depth = 0;
  let groups = 0;
  let position = 0;
  let spansWritten = 0;
  for (let i = 0; i < words.length; i += 2) {
    const word = words[i + 1]!;
    if (word >>> record.kindShift === record.kind.group) {
      const start = words[i]!;
      let child = 0;
      while (depth && nodes[(stack[depth - 1]! - 1) * 5]! >= start) {
        const nested = stack[--depth]!;
        nodes[(nested - 1) * 5 + 4] = child;
        child = nested;
      }
      const offset = groups * 5;
      nodes[offset] = start;
      nodes[offset + 1] = position;
      nodes[offset + 2] = word & record.styleMask;
      nodes[offset + 3] = child;
      if (values) values[groups] = sourceValues!.get(i);
      stack[depth++] = ++groups;
      continue;
    }
    position = words[i]!;
    // Equal neighbors can only meet across a group record.
    if (spansWritten && words[spansWritten - 1] === word) words[spansWritten - 2] = position;
    else {
      words[spansWritten++] = position;
      words[spansWritten++] = word;
    }
  }
  let node = 0;
  while (depth) {
    const root = stack[--depth]!;
    nodes[(root - 1) * 5 + 4] = node;
    node = root;
  }
  const ordered = new Uint32Array(count * 3);
  const orderedValues = values ? new Array<string | undefined>(count) : undefined;
  let index = 0;
  while (node) {
    const offset = (node - 1) * 5;
    ordered[index * 3] = nodes[offset]!;
    ordered[index * 3 + 1] = nodes[offset + 1]!;
    ordered[index * 3 + 2] = nodes[offset + 2]!;
    if (orderedValues) orderedValues[index] = values![node - 1];
    index++;
    const child = nodes[offset + 3]!;
    const sibling = nodes[offset + 4]!;
    if (child) {
      if (sibling) stack[depth++] = sibling;
      node = child;
    } else node = sibling || (depth ? stack[--depth]! : 0);
  }
  const extracted: { spans: Uint32Array; groups: Uint32Array; values?: (string | undefined)[] } = {
    spans: copySpans ? words.slice(0, spansWritten) : words.subarray(0, spansWritten),
    groups: ordered,
  };
  if (orderedValues?.some((value) => value !== undefined)) extracted.values = orderedValues;
  return extracted;
}
