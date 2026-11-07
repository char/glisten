import { raw, struct } from "#/testing/wat/mod.ts";

/** A queued paragraph span: where it ends, and its style (or a span kind). */
export const queued = struct({ end: "i32", style: "i32" });

/** A collected inline event, linked in source order. */
export const event = struct({ next: "i32", style: "i32", start: "i64", end: "i64", run: "i32" });

/** A source interval and the style it contributes during replay. */
export const interval = struct({ start: "i32", end: "i32", style: "i32" });

/**
 * A delimiter run. `remaining` shrinks as matches consume it, `consumed` counts
 * what its left edge has given up, and `previous`/`next` link the live stack.
 */
export const run = struct({
  position: "i32",
  length: "i32",
  remaining: "i32",
  marker: "i32",
  flags: "i32",
  previous: "i32",
  next: "i32",
  consumed: "i32",
});

/**
 * A resolved emphasis match. The offsets locate its delimiters within their runs;
 * `nextOpening` and `nextClosing` chain the matches each run opens and closes.
 */
export const match = struct({
  opener: "i32",
  closer: "i32",
  count: "i32",
  openerOffset: "i32",
  closerOffset: "i32",
  nextOpening: "i32",
  nextClosing: "i32",
  style: "i32",
});

/** Per run: the first match it opens, and the first and last match it closes. */
export const ends = struct({ opens: "i32", closes: "i32", lastClose: "i32" });

/** A source-run index in the active delimiter stack. */
export const delimiterStackEntry = struct({ index: "i32" });

/** An open `[` or `![` on the bracket stack. */
export const bracket = struct({
  below: "i32",
  generation: "i32",
  cursor: "i64",
  image: "i32",
  delimiterBottom: "i32",
  event: "i32",
});

/**
 * A resolved link or image: the style around it, which replay restores after
 * it, and where its URI and title begin and end. `uri` is -1 for the reference
 * forms, and the title positions are -1 without a title.
 */
export const link = struct({ saved: "i32", uri: "i32", titleStart: "i32", titleEnd: "i32" });

/** An indexed backtick run: where it starts, and the logical cursor after its closer. */
export const backtickRun = struct({ position: "i32", closer: "i64" });

/** Read a named local, for struct addresses. */
export const get = (name: string) => raw(`(local.get $${name})`);
