import { test } from "avril:test";
import {
  ascii,
  byte,
  byteSet,
  bytes,
  bytesOf,
  defineGrammar,
  except,
  intersection,
  notNext,
  on,
  paint,
  previousNotIn,
  range,
  separatedRun,
  union,
  utf8Bytes,
} from "./mod.ts";
import { equal, throws } from "#/testing/assert.ts";

test("byte ranges and UTF-8 strings have explicit distinct representations", () => {
  equal(bytesOf(byteSet({ ranges: [[0xe9, 0xe9]] })), [0xe9]);
  equal(bytesOf(utf8Bytes("é")), [0xa9, 0xc3]);
  equal(bytesOf(ascii("aZa")), [90, 97]);
  throws(() => ascii("é"), RangeError);
});

test("byte set operations preserve set semantics", () => {
  const range = byteSet({
    bytes: [255, 0],
    ranges: [
      [2, 4],
      [3, 5],
    ],
  });
  equal(bytesOf(range), [0, 2, 3, 4, 5, 255]);
  equal(bytesOf(union(range, ascii("A"))), [0, 2, 3, 4, 5, 65, 255]);
  equal(bytesOf(intersection(range, byteSet({ ranges: [[3, 8]] }))), [3, 4, 5]);
  equal(bytesOf(except(range, byteSet({ ranges: [[3, 8]] }))), [0, 2, 255]);
  equal(bytesOf(union()), []);
});

test("ASCII shorthand and ranges enforce their boundaries", () => {
  equal(bytesOf("\x00A\x7fA"), [0, 65, 127]);
  equal(bytesOf(range("x", "z")), [120, 121, 122]);
  equal(bytesOf(range("\x7f", "\x7f")), [127]);
  for (const value of ["é", "\x80", "😀", "\ud800"]) {
    throws(() => bytesOf(value), RangeError);
    throws(() => on(value, paint("plain")), RangeError);
    throws(() => byte(value), RangeError);
    throws(() => bytes(value), RangeError);
    throws(() => notNext(value), RangeError);
    throws(() => previousNotIn(value), RangeError);
    throws(() => separatedRun("x", value), RangeError);
    throws(
      () =>
        defineGrammar({
          name: "non-ascii",
          initial: "root",
          states: {
            root: { style: "plain", arms: [on("a", { kind: "one", set: value }, paint("plain"))] },
          },
        }),
      RangeError,
    );
  }
  for (const [start, end] of [
    ["", "z"],
    ["aa", "z"],
    ["a", "é"],
    ["z", "a"],
  ])
    throws(() => range(start!, end!), RangeError);
});

test("byte set construction rejects invalid byte values and ranges", () => {
  for (const value of [-1, 256, 1.5, NaN, Infinity]) {
    throws(() => byteSet({ bytes: [value] }), RangeError);
    throws(() => byteSet({ ranges: [[0, value]] }), RangeError);
  }
  throws(() => byteSet({ ranges: [[2, 1]] }), RangeError);
  throws(() => bytesOf({ chars: "a", ranges: [["b", "c"]] } as never), Error);
});
