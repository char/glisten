import { test } from "avril:test";
import { assert, equal, throws } from "#/testing/assert.ts";
import { document, mapDocumentRecords } from "./documents.ts";

const text = new TextEncoder();

test("a single-piece document borrows source storage", () => {
  const source = text.encode("--abc--");
  const doc = document(source, [{ start: 2, end: 5 }]);
  assert(doc.bytes.buffer === source.buffer);
  equal(Array.from(doc.bytes), Array.from(text.encode("abc")));
  equal(doc.mapRange(0, 3), [{ start: 2, end: 5 }]);
  source[3] = 90;
  equal(doc.bytes[1], 90);
});

test("a joined document maps every logical range through its piece boundaries", () => {
  const source = text.encode("--ab---cdef--gh-");
  const pieces = [
    { start: 2, end: 4 },
    { start: 7, end: 11 },
    { start: 13, end: 15 },
  ];
  const doc = document(source, pieces);
  equal(Array.from(doc.bytes), Array.from(text.encode("abcdefgh")));
  assert(doc.bytes.buffer !== source.buffer);
  const offsets = pieces.flatMap(({ start, end }) =>
    Array.from({ length: end - start }, (_, i) => start + i),
  );
  for (let start = 0; start <= offsets.length; start++) {
    for (let end = start; end <= offsets.length; end++) {
      const ranges = doc.mapRange(start, end);
      const mapped = ranges.flatMap((range) =>
        Array.from({ length: range.end - range.start }, (_, i) => range.start + i),
      );
      equal(mapped, offsets.slice(start, end));
      for (const range of ranges)
        assert(pieces.some((piece) => range.start >= piece.start && range.end <= piece.end));
    }
  }
  equal(doc.mapRange(1, 7), [
    { start: 3, end: 4 },
    { start: 7, end: 11 },
    { start: 13, end: 14 },
  ]);
});

test("adjacent pieces retain their boundary", () => {
  const doc = document(text.encode("abcd"), [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
  ]);
  equal(doc.mapRange(0, 4), [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
  ]);
  equal(doc.mapRange(2, 2), []);
});

test("record mapping splits spans and injection segments and resolves names across gaps", () => {
  const doc = document(text.encode("--ba---shxx--yz-"), [
    { start: 2, end: 4 },
    { start: 7, end: 11 },
    { start: 13, end: 15 },
  ]);
  const mapped = mapDocumentRecords(doc, [
    { kind: "opens", injection: 0, name: [0, 4] },
    { kind: "span", style: 2, end: 3 },
    { kind: "segment", injection: 0, end: 8, closes: true },
  ]);
  const open = mapped[0]!;
  assert(open.kind === "opens" && "name" in open);
  equal(new TextDecoder().decode(open.name), "bash");
  equal(mapped.slice(1), [
    { kind: "span", style: 2, end: 4 },
    { kind: "span", style: 2, end: 8 },
    { kind: "segment", injection: 0, end: 11, closes: false },
    { kind: "segment", injection: 0, end: 15, closes: true },
  ]);
});

test("record mapping accepts a document at a nonzero input offset", () => {
  const doc = document(text.encode("-ab---cd-"), [
    { start: 1, end: 3 },
    { start: 6, end: 8 },
  ]);
  const mapped = mapDocumentRecords(
    doc,
    [
      { kind: "opens", injection: 0, name: [101, 104] },
      { kind: "segment", injection: 0, end: 104, closes: true },
    ],
    100,
  );
  const open = mapped[0]!;
  assert(open.kind === "opens" && "name" in open);
  equal(new TextDecoder().decode(open.name), "bcd");
  equal(mapped.slice(1), [
    { kind: "segment", injection: 0, end: 3, closes: false },
    { kind: "segment", injection: 0, end: 8, closes: true },
  ]);
  throws(() => mapDocumentRecords(doc, [{ kind: "span", style: 0, end: 4 }], 100), RangeError);
  throws(
    () => mapDocumentRecords(doc, [{ kind: "opens", injection: 0, name: [99, 101] }], 100),
    RangeError,
  );
});

test("invalid source pieces and logical ranges are rejected", () => {
  const source = text.encode("abcd");
  for (const pieces of [
    [],
    [{ start: 1, end: 1 }],
    [{ start: -1, end: 1 }],
    [{ start: 0, end: 5 }],
    [
      { start: 0, end: 2 },
      { start: 1, end: 3 },
    ],
  ])
    throws(() => document(source, pieces), RangeError);
  const doc = document(source, [{ start: 0, end: 4 }]);
  for (const [start, end] of [
    [-1, 1],
    [2, 1],
    [0, 5],
    [0.5, 1],
    [0, NaN],
  ])
    throws(() => doc.mapRange(start!, end!), RangeError);
});
