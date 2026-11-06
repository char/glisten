import { test } from "avril:test";
import { encode } from "#/abi/mod.ts";
import { equal } from "#/testing/assert.ts";
import { extractGroups } from "./extract_groups.ts";

test("postorder extraction preserves nested and equal-boundary ordering and values", () => {
  const words = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 1, style: 1 },
    { kind: "group", start: 1, style: 2 },
    { kind: "span", end: 4, style: 0 },
    { kind: "group", start: 3, style: 3 },
    { kind: "group", start: 0, style: 4 },
    { kind: "span", end: 6, style: 0 },
    { kind: "group", start: 5, style: 5 },
  ]);
  const result = extractGroups(
    {
      status: "ok",
      injections: 0,
      groups: 5,
      records: () => words,
      groupValues: new Map([
        [2, "inner"],
        [4, "outer"],
        [14, "last"],
      ]),
    },
    words,
    true,
  );
  equal([...result.spans], [6, 0]);
  equal([...result.groups], [0, 4, 4, 1, 2, 2, 1, 2, 1, 3, 4, 3, 5, 6, 5]);
  equal(result.values, [undefined, "outer", "inner", undefined, "last"]);
});
