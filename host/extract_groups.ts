import { record } from "#/abi/mod.ts";
import type { CallResult } from "./engine.ts";

/**
 * Reusable extraction buffers. A borrowed result (no span copy) may alias this
 * scratch's order buffer until the next extraction that uses the same scratch.
 */
export class GroupScratch {
  nodes: Uint32Array<ArrayBuffer> = new Uint32Array(0);
  stack: Uint32Array<ArrayBuffer> = new Uint32Array(0);
  order: Uint32Array<ArrayBuffer> = new Uint32Array(0);
  /** Set while extraction holds these buffers, so reentrant calls allocate their own. */
  busy = false;
}

function reserve(buffer: Uint32Array<ArrayBuffer>, words: number): Uint32Array<ArrayBuffer> {
  return buffer.length >= words ? buffer : new Uint32Array(Math.max(words, buffer.length * 2, 64));
}

/**
 * Extract a single document's postorder groups without allocating per-group objects,
 * compacting the remaining spans in place (the records belong to this call).
 *
 * A scratch reuses the internal buffers; copying results never alias it. A custom
 * group-value map may re-enter this function, so a busy scratch falls back to fresh
 * buffers rather than overwriting the extraction already in progress.
 */
export function extractGroups(
  result: Extract<CallResult, { status: "ok" }>,
  words: Uint32Array,
  copySpans: boolean,
  scratch?: GroupScratch,
): { spans: Uint32Array; groups: Uint32Array; values?: (string | undefined)[] } {
  const count = result.groups!;
  const target = scratch !== undefined && !scratch.busy ? scratch : undefined;
  // Nodes are [start, end, style, first child, next sibling]. Links and stack
  // entries are one-based, leaving zero as the empty link.
  const nodes = target
    ? (target.nodes = reserve(target.nodes, count * 5))
    : new Uint32Array(count * 5);
  const stack = target ? (target.stack = reserve(target.stack, count)) : new Uint32Array(count);
  const order =
    target && !copySpans
      ? (target.order = reserve(target.order, count * 3))
      : new Uint32Array(count * 3);
  if (target) target.busy = true;
  try {
    const sourceValues = result.groupValues;
    const values = sourceValues?.size ? new Array<string | undefined>(count) : undefined;
    let depth = 0;
    let groups = 0;
    let position = 0;
    let spans = 0;
    // ABI spans are already merged; only removing a group can make equal styles adjacent.
    let mergePending = false;
    for (let i = 0; i < words.length; i += 2) {
      const style = words[i + 1]!;
      if (style >>> record.kindShift === record.kind.group) {
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
        nodes[offset + 2] = style & record.styleMask;
        nodes[offset + 3] = child;
        if (values) values[groups] = sourceValues!.get(i);
        stack[depth++] = ++groups;
        mergePending = true;
        continue;
      }
      position = words[i]!;
      if (mergePending) {
        mergePending = false;
        if (words[spans - 1] === style) {
          words[spans - 2] = position;
          continue;
        }
      }
      words[spans++] = position;
      words[spans++] = style;
    }
    let node = 0;
    while (depth) {
      const root = stack[--depth]!;
      nodes[(root - 1) * 5 + 4] = node;
      node = root;
    }
    const orderedValues = values ? new Array<string | undefined>(count) : undefined;
    let index = 0;
    while (node) {
      const offset = (node - 1) * 5;
      order[index * 3] = nodes[offset]!;
      order[index * 3 + 1] = nodes[offset + 1]!;
      order[index * 3 + 2] = nodes[offset + 2]!;
      if (orderedValues) orderedValues[index] = values![node - 1];
      index++;
      const child = nodes[offset + 3]!;
      const sibling = nodes[offset + 4]!;
      if (child) {
        if (sibling) stack[depth++] = sibling;
        node = child;
      } else node = sibling || (depth ? stack[--depth]! : 0);
    }
    const extracted: {
      spans: Uint32Array;
      groups: Uint32Array;
      values?: (string | undefined)[];
    } = {
      spans: copySpans ? words.slice(0, spans) : words.subarray(0, spans),
      groups: target && !copySpans ? order.subarray(0, index * 3) : order,
    };
    if (orderedValues?.some((value) => value !== undefined)) extracted.values = orderedValues;
    return extracted;
  } finally {
    if (target) target.busy = false;
  }
}
