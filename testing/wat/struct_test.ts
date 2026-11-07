import { test } from "avril:test";
import { equal } from "#/testing/assert.ts";
import { struct } from "./struct.ts";
import { print, wat } from "./template.ts";

const pair = struct({ first: "i32", wide: "i64", last: "i32" });
const triple = struct({ a: "i32", b: "i32", c: "i32" });

test("fields lie at their natural alignment, and records pad to the widest field", () => {
  equal(pair.offset, { first: 0, wide: 8, last: 16 });
  equal(pair.size, 24);
  equal(triple.size, 12);
});

test("accessors load and store with the field's type and offset", () => {
  equal(print(pair.get(wat`(local.get $p)`, "first")), "(i32.load (local.get $p))");
  equal(print(pair.get(wat`(local.get $p)`, "wide")), "(i64.load offset=8 (local.get $p))");
  equal(
    print(pair.set(wat`(local.get $p)`, "last", wat`(i32.const 1)`)),
    "(i32.store offset=16 (local.get $p) (i32.const 1))",
  );
});

test("array addressing shifts for power-of-two sizes and multiplies otherwise", () => {
  const record = struct({ a: "i64", b: "i64" });
  equal(print(record.at(wat`$b`, wat`$i`)), "(i32.add $b (i32.shl $i (i32.const 4)))");
  equal(print(triple.at(wat`$b`, wat`$i`)), "(i32.add $b (i32.mul $i (i32.const 12)))");
});
