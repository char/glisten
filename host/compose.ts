import { checkRecords, segment } from "#/abi/mod.ts";
import type { Callee, CallContext, CallResult } from "./engine.ts";
import { emit, emitSingles, type Call } from "./emit.ts";
import { extractGroups } from "./extract_groups.ts";
import { Names } from "./names.ts";
import { group, recordRanges, scan, Scratch, writeBatches } from "./planning.ts";
import { Styles } from "./styles.ts";
import { callJoined, segmentRanges } from "./joined.ts";

/** The single whole-document layout every root call passes to its module. */
const whole = new Uint32Array(2);

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

export type ComposeOptions = {
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
  whole[0] = 0;
  whole[1] = length;
  const result = root.call(context, whole);
  if (checks && result.status === "ok") checkRecords(result.records(), whole, result.injections);
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

/** Planning state shared by one composition walk. */
type Walk = {
  readonly context: CallContext;
  readonly names: Names<Callee>;
  readonly missing: Set<string>;
  readonly scratch: Scratch;
  readonly checks: boolean;
  singleSegments: boolean;
};

function plan(walk: Walk, callee: Callee, segments: Uint32Array, rootResult?: CallResult): Call {
  const { names, missing, scratch, checks } = walk;
  const joined = rootResult
    ? { result: rootResult, context: walk.context }
    : callJoined(callee, walk.context, segments, checks);
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
      ranges: rootResult && hasGroups ? new Uint32Array() : recordRanges(words, segments, frame),
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
    rootResult !== undefined && !hasGroups,
  );
  if (rootResult)
    walk.singleSegments = scanned.singleSegments && scanned.length === result.injections;
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
  for (const batch of planned.batches) call.children.push(plan(walk, batch.target, batch.segments));
  return call;
}

// A descendant may grow shared Wasm memory, detaching all earlier views.
function refresh(call: Call): void {
  call.words = call.result.records();
  for (const child of call.children) refresh(child);
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
  const walk: Walk = {
    context,
    names,
    missing: new Set(),
    scratch,
    checks,
    singleSegments: false,
  };

  try {
    const tree = plan(
      walk,
      root,
      new Uint32Array([0, length, segment.starts | segment.ends]),
      rootResult,
    );
    if (!tree.result.injections) {
      const extracted = extractGroups(tree.result, tree.words, options.copySpans !== false);
      return { status: "ok", missing: [], ...extracted };
    }
    refresh(tree);
    const spans = scratch.output(mark);
    if (
      walk.singleSegments &&
      tree.children.every((child) => !child.result.injections && !child.hasGroups)
    ) {
      emitSingles(tree, spans, missingStyle);
      return {
        status: "ok",
        spans: spans.finish(options.copySpans !== false),
        missing: [...walk.missing],
      };
    }
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
    const result: Extract<Result, { status: "ok" }> = {
      status: "ok",
      spans: spans.finish(options.copySpans !== false),
      missing: [...walk.missing],
    };
    if (ordered.length) result.groups = Uint32Array.from(ordered.flatMap((entry) => entry.group));
    if (values.some((value) => value !== undefined))
      result.values = ordered.map((entry) => entry.value);
    return result;
  } catch (error) {
    if (error instanceof Failure) return { status: "resource" };
    throw error;
  } finally {
    scratch.release(mark);
  }
}
