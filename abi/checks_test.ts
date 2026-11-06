import { test } from "avril:test";
import { equal, throws } from "#/testing/assert.ts";
import { checkRecords, encode, type OutputRecord } from "./mod.ts";

const check = (records: OutputRecord[], start = 0, end = 10) =>
  checkRecords(encode(records), Uint32Array.of(start, end), 0);

test("groups nest in closing order, including at a document end", () => {
  check([
    { kind: "span", end: 6, style: 0 },
    { kind: "group", start: 3, style: 1 },
    { kind: "group", start: 1, style: 1 },
    { kind: "span", end: 10, style: 0 },
    { kind: "group", start: 0, style: 1 },
  ]);
});

test("crossing groups and outer-first equal-end groups are rejected", () => {
  throws(
    () =>
      check([
        { kind: "span", end: 5, style: 0 },
        { kind: "group", start: 1, style: 1 },
        { kind: "span", end: 10, style: 0 },
        { kind: "group", start: 3, style: 1 },
      ]),
    Error,
    /crossing/,
  );
  throws(
    () =>
      check([
        { kind: "span", end: 10, style: 0 },
        { kind: "group", start: 1, style: 1 },
        { kind: "group", start: 3, style: 1 },
      ]),
    Error,
    /crossing/,
  );
});

test("group starts must be within their document and strictly before the end", () => {
  throws(
    () =>
      check([
        { kind: "span", end: 10, style: 0 },
        { kind: "group", start: 10, style: 1 },
      ]),
    Error,
    /empty/,
  );
  throws(
    () =>
      check(
        [
          { kind: "span", end: 10, style: 0 },
          { kind: "group", start: 1, style: 1 },
        ],
        2,
      ),
    Error,
    /outside/,
  );
});

test("a group flush permits equal span styles on either side", () => {
  const records: OutputRecord[] = [
    { kind: "span", end: 5, style: 0 },
    { kind: "group", start: 2, style: 1 },
    { kind: "span", end: 10, style: 0 },
  ];
  check(records);
  throws(() => check([records[0]!, records[2]!]), Error, /same style/);
  equal(checkRecords(encode(records), Uint32Array.of(0, 10), 0), undefined);
});

test("groups at one document's end do not leak into the next", () => {
  checkRecords(
    encode([
      { kind: "span", end: 4, style: 0 },
      { kind: "group", start: 0, style: 1 },
      { kind: "span", end: 10, style: 0 },
      { kind: "group", start: 6, style: 1 },
    ]),
    Uint32Array.of(0, 4, 6, 10),
    0,
  );
});
