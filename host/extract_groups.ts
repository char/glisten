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
  const data = new Uint32Array(count * 5);
  const stack = new Uint32Array(count);
  const sourceValues = result.groupValues;
  const values = sourceValues?.size ? new Array<string | undefined>(count) : undefined;
  let depth = 0;
  let groups = 0;
  let position = 0;
  let written = 0;
  for (let i = 0; i < words.length; i += 2) {
    const word = words[i + 1]!;
    if (word >>> record.kindShift === record.kind.group) {
      const start = words[i]!;
      let child = 0;
      while (depth && data[(stack[depth - 1]! - 1) * 5]! >= start) {
        const nested = stack[--depth]!;
        data[(nested - 1) * 5 + 4] = child;
        child = nested;
      }
      const offset = groups * 5;
      data[offset] = start;
      data[offset + 1] = position;
      data[offset + 2] = word & record.styleMask;
      data[offset + 3] = child;
      if (values) values[groups] = sourceValues!.get(i);
      stack[depth++] = ++groups;
      continue;
    }
    position = words[i]!;
    // Equal neighbors can only meet across a group record.
    if (written && words[written - 1] === word) words[written - 2] = position;
    else {
      words[written++] = position;
      words[written++] = word;
    }
  }
  let current = 0;
  while (depth) {
    const root = stack[--depth]!;
    data[(root - 1) * 5 + 4] = current;
    current = root;
  }
  const ordered = new Uint32Array(count * 3);
  const orderedValues = values ? new Array<string | undefined>(count) : undefined;
  let index = 0;
  while (current) {
    const offset = (current - 1) * 5;
    ordered[index * 3] = data[offset]!;
    ordered[index * 3 + 1] = data[offset + 1]!;
    ordered[index * 3 + 2] = data[offset + 2]!;
    if (orderedValues) orderedValues[index] = values![current - 1];
    index++;
    const child = data[offset + 3]!;
    const sibling = data[offset + 4]!;
    if (child) {
      if (sibling) stack[depth++] = sibling;
      current = child;
    } else current = sibling || (depth ? stack[--depth]! : 0);
  }
  return {
    spans: copySpans ? words.slice(0, written) : words.subarray(0, written),
    groups: ordered,
    ...(orderedValues?.some((value) => value !== undefined) ? { values: orderedValues } : {}),
  };
}
