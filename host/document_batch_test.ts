import { test } from "avril:test";
import { assert, equal } from "#/testing/assert.ts";
import { prepareDocumentBatch } from "./document_batch.ts";
import { Arena } from "./memory.ts";

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
const pieces = [
  [
    { start: 0, end: 2 },
    { start: 4, end: 6 },
  ],
  [{ start: 8, end: 10 }],
  [
    { start: 1, end: 2 },
    { start: 8, end: 10 },
  ],
];

test("a batch exposes each joined document and its source mapping", () => {
  for (const shared of [false, true]) {
    const source = encode("ab--cd--ef");
    const input = shared ? new Arena(65536).place(source) : { source: () => source };
    const batch = prepareDocumentBatch(input, pieces);
    equal(batch.ranges.length, 6);
    equal(
      Array.from(batch.maps, (map) => decode(map.bytes)),
      ["abcd", "ef", "bef"],
    );
    for (const [index, map] of batch.maps.entries()) {
      const start = batch.ranges[index * 2]!;
      const end = batch.ranges[index * 2 + 1]!;
      equal(Array.from(batch.context.source().subarray(start, end)), Array.from(map.bytes));
      equal(map.mapRange(0, map.bytes.length), pieces[index]);
    }
    equal(Array.from(batch.ranges.subarray(2, 4)), [8, 10]);
  }
});

test("single-piece batches retain their input without copying", () => {
  const source = encode("abc");
  const input = { source: () => source };
  const batch = prepareDocumentBatch(input, [[{ start: 1, end: 3 }]]);
  assert(batch.context === input);
  assert(batch.maps[0]!.bytes.buffer === source.buffer);
  equal(Array.from(batch.ranges), [1, 3]);
});

test("lazy maps use a fresh source after joining grows shared memory", () => {
  const arena = new Arena(4 * 65536);
  const source = Uint8Array.from({ length: 40000 }, (_, index) => index % 251);
  const parts = [
    [
      { start: 0, end: 20000 },
      { start: 20001, end: 40000 },
    ],
  ];
  const batch = prepareDocumentBatch(arena.place(source), parts, true);
  equal(batch.maps[0]!.mapRange(0, 39999), parts[0]);
  equal(Array.from(batch.maps[0]!.bytes), [
    ...source.subarray(0, 20000),
    ...source.subarray(20001),
  ]);
});

test("batch document views survive later shared-memory growth", () => {
  const arena = new Arena(4 * 65536);
  const source = Uint8Array.from({ length: 40000 }, (_, index) => index % 251);
  const batch = prepareDocumentBatch(arena.place(source), [
    [
      { start: 0, end: 20000 },
      { start: 20001, end: 40000 },
    ],
    [{ start: 100, end: 200 }],
  ]);
  arena.allocate(65536);
  equal(Array.from(batch.maps[0]!.bytes), [
    ...source.subarray(0, 20000),
    ...source.subarray(20001),
  ]);
  equal(Array.from(batch.maps[1]!.bytes), Array.from(source.subarray(100, 200)));
});
