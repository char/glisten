import { test } from "avril:test";
import { ABI, record, type Manifest } from "#/abi/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import type { Callee } from "./engine.ts";
import { Names } from "./names.ts";
import { group, scan, Scratch, writeBatches } from "./planning.ts";

function callee(language: string, embeds: string[]): Callee {
  const manifest: Manifest = {
    abi: ABI,
    language,
    aliases: [],
    embeds,
    styles: [{ name: "plain" }],
    styleMap: 0,
    areaBytes: 0,
    maxDepth: 16,
  };
  return {
    manifest,
    useStyles: () => {},
    call: () => {
      throw new Error("not called");
    },
  };
}

test("planner scratch and links scale with segment records, not spans", () => {
  const root = callee("root", ["child"]);
  const names = new Names<Callee>();
  names.add(["child"], callee("child", []));
  function plan(spanCount: number) {
    const source = new Uint8Array(spanCount + 1);
    const words = new Uint32Array((spanCount + 2) * 2);
    for (let i = 0; i < spanCount; i++) {
      words[i * 2] = i + 1;
      words[i * 2 + 1] = i % 2;
    }
    words[spanCount * 2 + 1] = record.kind.opensStatic << record.kindShift;
    words[spanCount * 2 + 2] = spanCount + 1;
    words[spanCount * 2 + 3] = record.kind.segmentCloses << record.kindShift;
    const scanned = scan(
      words,
      new Uint32Array([0, source.length, 3]),
      1,
      root,
      { source: () => source },
      names,
      new Set(),
    );
    return { scanned, batch: writeBatches(scanned, group(scanned)) };
  }
  const small = plan(2);
  const large = plan(100000);
  equal([small.scanned.length, large.scanned.length], [1, 1]);
  assert(large.scanned.data.length <= small.scanned.data.length * 2);
  equal([large.batch.linkChildren?.length, large.batch.linkRanges?.length], [1, 1]);
  equal(Array.from(large.batch.batches[0]!.segments), [100000, 100001, 3]);
});

test("growing segment scratch preserves batch ordering and links", () => {
  const root = callee("root", ["child"]);
  const names = new Names<Callee>();
  names.add(["child"], callee("child", []));
  const count = 20;
  const source = new Uint8Array(count);
  const words = new Uint32Array(count * 4);
  for (let id = 0; id < count; id++) {
    words[id * 4 + 1] = (record.kind.opensStatic << record.kindShift) | id;
    words[id * 4 + 2] = id + 1;
    words[id * 4 + 3] = (record.kind.segmentCloses << record.kindShift) | id;
  }
  const scanned = scan(
    words,
    new Uint32Array([0, count, 3]),
    count,
    root,
    { source: () => source },
    names,
    new Set(),
  );
  const planned = writeBatches(scanned, group(scanned));
  equal(
    Array.from(planned.batches[0]!.segments),
    Array.from({ length: count }, (_, id) => [id, id + 1, 3]).flat(),
  );
  equal(
    Array.from(planned.linkRanges!),
    Array.from({ length: count }, (_, id) => id),
  );
  equal(Array.from(planned.linkChildren!), new Array(count).fill(0));
});

test("nested scratch leases restore the caller's cursor", () => {
  const scratch = new Scratch();
  const outer = scratch.next();
  const mark = scratch.mark();
  const inner = scratch.next();
  scratch.release(mark);
  assert(scratch.next() === inner);
  assert(inner !== outer);
});
