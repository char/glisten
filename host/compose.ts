import { checkRecords, segment } from "#/abi/mod.ts";
import type { Callee, CallContext, CallResult } from "./engine.ts";
import { emit, type Call } from "./emit.ts";
import { extractGroups } from "./extract_groups.ts";
import { Names } from "./names.ts";
import { group, recordRanges, scan, Scratch, writeBatches } from "./planning.ts";
import { Styles } from "./styles.ts";
import { callJoined, callWhole, segmentRanges } from "./joined.ts";

/** A successful span tiling, or a resource failure. */
export type Result =
  | {
      status: "ok";
      spans: Uint32Array;
      missing: string[];
      groups?: Uint32Array;
      values?: (string | undefined)[];
    }
  | { status: "resource" };

class Failure extends Error {}

type ComposeOptions = {
  names: Names<Callee>;
  missingStyle: number;
  checks: boolean;
  scratch?: Scratch;
  copySpans?: boolean;
};

/** Compose any set of ABI callees; style mappings are installed before the first call. */
export function composeWith(
  callees: Callee[],
  language: string,
  source: Uint8Array,
  options: { missingStyle?: string; checks?: boolean } = {},
): Result {
  const styles = new Styles();
  const missingStyle = styles.id(options.missingStyle ?? "plain");
  const names = new Names<Callee>();
  for (const callee of callees) {
    callee.useStyles(styles.map(callee.manifest.styles));
    names.add([callee.manifest.language, ...callee.manifest.aliases], callee);
  }
  return compose(
    language,
    { source: () => source },
    {
      names,
      missingStyle,
      checks: options.checks ?? false,
    },
  );
}

/** Plan calls and emit spans without depending on a particular callee implementation. */
export function compose(language: string, context: CallContext, options: ComposeOptions): Result {
  const { names, missingStyle, checks } = options;
  const length = context.source().length;
  if (!length) return { status: "ok", spans: new Uint32Array(), missing: [] };
  const root = names.get(language);
  if (!root)
    return {
      status: "ok",
      spans: new Uint32Array([length, missingStyle]),
      missing: [language],
    };
  const result = callWhole(root, context, length, checks);
  if (result.status === "resource") return { status: "resource" };
  if (!result.injections && !((result.groups ?? 0) > 0)) {
    const records = result.records();
    return {
      status: "ok",
      spans: options.copySpans === false ? records : records.slice(),
      missing: [],
    };
  }
  return composeChildren(root, result, context, length, options);
}

function composeChildren(
  root: Callee,
  rootResult: Extract<CallResult, { status: "ok" }>,
  context: CallContext,
  length: number,
  options: ComposeOptions,
): Result {
  const { names, missingStyle, checks } = options;
  const scratch = options.scratch ?? new Scratch();
  const mark = scratch.mark();
  const missing = new Set<string>();

  function plan(callee: Callee, segments: Uint32Array, rootCall = false): Call {
    const joined = rootCall
      ? { result: rootResult, context }
      : callJoined(callee, context, segments, checks);
    const result = joined.result;
    if (result.status === "resource") throw new Failure();
    const words = result.records();
    if (checks) checkRecords(words, segmentRanges(segments), result.injections);
    const hasGroups = (result.groups ?? 0) > 0;
    const frame = scratch.next();
    if (!result.injections) {
      return {
        result,
        words,
        ranges: rootCall && hasGroups ? new Uint32Array() : recordRanges(words, segments, frame),
        children: [],
        hasGroups,
      };
    }
    const scanned = scan(
      words,
      segments,
      result.injections,
      callee,
      joined.context,
      names,
      missing,
      frame,
    );
    const grouped = group(scanned);
    const planned = writeBatches(scanned, grouped);
    const call: Call = {
      result,
      words,
      ranges: scanned.ranges,
      children: [],
      hasGroups,
      linkChildren: planned.linkChildren,
      linkRanges: planned.linkRanges,
    };
    for (const batch of planned.batches) call.children.push(plan(batch.target, batch.segments));
    return call;
  }

  // A descendant may grow shared Wasm memory, detaching all earlier views.
  function refresh(call: Call): void {
    call.words = call.result.records();
    for (const child of call.children) refresh(child);
  }

  try {
    const tree = plan(root, new Uint32Array([0, length, segment.starts | segment.ends]), true);
    if (!tree.result.injections) {
      const extracted = extractGroups(tree.result, tree.words, options.copySpans !== false);
      return { status: "ok", missing: [], ...extracted };
    }
    refresh(tree);
    const spans = scratch.output(mark);
    const groups: number[] = [];
    const values: (string | undefined)[] = [];
    emit(tree, 0, tree.words.length, 0, spans, missingStyle, groups, values);
    const ordered = Array.from({ length: groups.length / 3 }, (_, i) => ({
      group: groups.slice(i * 3, i * 3 + 3),
      value: values[i],
      index: i,
    }));
    ordered.sort(
      (a, b) => a.group[0]! - b.group[0]! || b.group[1]! - a.group[1]! || b.index - a.index,
    );
    return {
      status: "ok",
      spans: spans.finish(options.copySpans !== false),
      missing: [...missing],
      ...(ordered.length
        ? { groups: Uint32Array.from(ordered.flatMap((entry) => entry.group)) }
        : {}),
      ...(values.some((value) => value !== undefined)
        ? { values: ordered.map((entry) => entry.value) }
        : {}),
    };
  } catch (error) {
    if (error instanceof Failure) return { status: "resource" };
    throw error;
  } finally {
    scratch.release(mark);
  }
}
