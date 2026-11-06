import { test } from "avril:test";
import { assert, equal, throws } from "#/testing/assert.ts";
import { Arena, ResourceError } from "./memory.ts";

test("a single-piece document stays in place", () => {
  const arena = new Arena(65536);
  const context = arena.place(new Uint8Array([1, 2, 3, 4]));
  const before = arena.outputStart();
  const joined = arena.join(context, [{ start: 1, end: 3 }]);
  assert(joined.context === context);
  equal(joined.range, { start: 1, end: 3 });
  equal(arena.outputStart(), before);
});

test("joining uses fresh shared-memory views across growth", () => {
  const arena = new Arena(4 * 65536);
  const bytes = Uint8Array.from({ length: 40000 }, (_, index) => index % 251);
  const context = arena.place(bytes);
  const stale = context.source();
  const joined = arena.join(context, [
    { start: 0, end: 20000 },
    { start: 20001, end: 40000 },
  ]);
  assert(stale.buffer !== arena.memory.buffer);
  const expected = new Uint8Array(39999);
  expected.set(bytes.subarray(0, 20000));
  expected.set(bytes.subarray(20001), 20000);
  equal(
    Array.from(joined.context.source().subarray(joined.range.start, joined.range.end)),
    Array.from(expected),
  );
  equal(
    Array.from(
      new Uint8Array(arena.memory.buffer, joined.context.placement!.input + joined.range.end, 16),
    ),
    new Array(16).fill(0),
  );
  arena.allocate(65536);
  equal(
    Array.from(joined.context.source().subarray(joined.range.start, joined.range.end)),
    Array.from(expected),
  );
  equal(Array.from(context.source()), Array.from(bytes));
});

test("joined and in-place documents can share one call context", () => {
  const arena = new Arena(65536);
  const context = arena.place(new TextEncoder().encode("abc--def--ghi"));
  const first = arena.join(context, [
    { start: 0, end: 3 },
    { start: 5, end: 8 },
  ]);
  const single = arena.join(first.context, [{ start: 10, end: 13 }]);
  assert(single.context === first.context);
  const last = arena.join(single.context, [
    { start: 2, end: 3 },
    { start: 10, end: 13 },
  ]);
  const source = last.context.source();
  const decoder = new TextDecoder();
  equal(decoder.decode(source.subarray(first.range.start, first.range.end)), "abcdef");
  equal(decoder.decode(source.subarray(single.range.start, single.range.end)), "ghi");
  equal(decoder.decode(source.subarray(last.range.start, last.range.end)), "cghi");
});

test("joining enforces the arena limit and rejects invalid pieces", () => {
  const arena = new Arena(65536);
  const context = arena.place(new Uint8Array(40000));
  throws(
    () =>
      arena.join(context, [
        { start: 0, end: 20000 },
        { start: 20000, end: 40000 },
      ]),
    ResourceError,
  );
  throws(() => arena.join(context, []), RangeError);
  throws(
    () =>
      arena.join(context, [
        { start: 1, end: 3 },
        { start: 2, end: 4 },
      ]),
    RangeError,
  );
  throws(() => arena.join({ source: () => new Uint8Array() }, [{ start: 0, end: 1 }]), Error);
});
