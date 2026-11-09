import { test } from "avril:test";
import { ABI, encode, type Manifest } from "#/abi/mod.ts";
import { puppet } from "#/testing/puppet.ts";
import { assert, equal } from "#/testing/assert.ts";
import { Highlighter } from "./mod.ts";
import { extractGroups, GroupScratch } from "./extract_groups.ts";

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

test("copied results stay valid across later extractions", () => {
  const first = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 1, style: 1 },
    { kind: "span", end: 3, style: 0 },
  ]);
  const second = encode([
    { kind: "span", end: 5, style: 2 },
    { kind: "group", start: 4, style: 3 },
    { kind: "span", end: 6, style: 2 },
  ]);
  const retained = extractGroups(
    { status: "ok", injections: 0, groups: 1, records: () => first },
    first,
    true,
  );
  const copiedSpans = [...retained.spans];
  const copiedGroups = [...retained.groups];
  const borrowed = extractGroups(
    { status: "ok", injections: 0, groups: 1, records: () => second },
    second,
    false,
  );
  equal([...borrowed.spans], [6, 2]);
  equal([...borrowed.groups], [4, 5, 3]);
  equal([...retained.spans], copiedSpans);
  equal([...retained.groups], copiedGroups);
});

test("borrowed extraction returns the latest call's groups", () => {
  const groupsOf = (end: number, start: number, style: number) => {
    const words = encode([
      { kind: "span", end, style: 0 },
      { kind: "group", start, style },
      { kind: "span", end: end + 1, style: 0 },
    ]);
    const result = extractGroups(
      { status: "ok", injections: 0, groups: 1, records: () => words },
      words,
      false,
    );
    return [...result.groups];
  };
  equal(groupsOf(4, 2, 1), [2, 4, 1]);
  equal(groupsOf(9, 7, 2), [7, 9, 2]);
});

test("a scratch reuses buffers without disturbing retained results", () => {
  const scratch = new GroupScratch();
  const retainedWords = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 1, style: 1 },
    { kind: "span", end: 3, style: 0 },
  ]);
  const retained = extractGroups(
    { status: "ok", injections: 0, groups: 1, records: () => retainedWords },
    retainedWords,
    true,
    scratch,
  );
  const retainedSpans = [...retained.spans];
  const retainedGroups = [...retained.groups];
  const borrowedWords = encode([
    { kind: "span", end: 5, style: 2 },
    { kind: "group", start: 4, style: 3 },
    { kind: "span", end: 6, style: 2 },
  ]);
  const borrowed = extractGroups(
    { status: "ok", injections: 0, groups: 1, records: () => borrowedWords },
    borrowedWords,
    false,
    scratch,
  );
  equal([...borrowed.spans], [6, 2]);
  equal([...borrowed.groups], [4, 5, 3]);
  equal([...retained.spans], retainedSpans);
  equal([...retained.groups], retainedGroups);
});

test("reentrant extraction with one scratch preserves both results", () => {
  const scratch = new GroupScratch();
  const innerWords = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 1, style: 2 },
    { kind: "span", end: 3, style: 0 },
  ]);
  const outerWords = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 1, style: 1 },
    { kind: "span", end: 3, style: 0 },
  ]);
  let innerGroups: number[] = [];
  class Reentrant extends Map<number, string> {
    override get(key: number): string | undefined {
      innerGroups = [
        ...extractGroups(
          { status: "ok", injections: 0, groups: 1, records: () => innerWords },
          innerWords,
          false,
          scratch,
        ).groups,
      ];
      return super.get(key);
    }
  }
  const outer = extractGroups(
    {
      status: "ok",
      injections: 0,
      groups: 1,
      records: () => outerWords,
      groupValues: new Reentrant([[2, "value"]]),
    },
    outerWords,
    false,
    scratch,
  );
  equal(innerGroups, [1, 2, 2]);
  equal([...outer.groups], [1, 2, 1]);
  equal(outer.values, ["value"]);
});

test("retained groups survive a later highlight", async () => {
  const manifest: Manifest = {
    abi: ABI,
    language: "color",
    aliases: [],
    embeds: [],
    styles: [{ name: "plain" }, { name: "grouped", tag: "g" }],
    styleMap: 0,
    areaBytes: 2048,
    maxDepth: 8,
  };
  const host = new Highlighter();
  await host.add(
    await puppet(manifest, [
      {
        injections: 0,
        records: [
          { kind: "span", end: 2, style: 0 },
          { kind: "group", start: 1, style: 1 },
          { kind: "span", end: 6, style: 0 },
        ],
      },
      {
        injections: 0,
        records: [
          { kind: "span", end: 3, style: 0 },
          { kind: "group", start: 0, style: 1 },
          { kind: "span", end: 6, style: 0 },
        ],
      },
    ]),
  );
  const retained = host.process("color", "abcdef");
  assert(retained.status === "ok");
  equal([...retained.spans], [6, 0]);
  equal([...retained.groups!], [1, 2, 1]);
  equal(host.highlight("color", "abcdef"), "<g-g>abc</g-g>def");
  equal([...retained.spans], [6, 0]);
  equal([...retained.groups!], [1, 2, 1]);
  equal(host.render("abcdef", retained), "a<g-g>b</g-g>cdef");
});

test("an overstated group count cannot expose a borrowed scratch tail", () => {
  const scratch = new GroupScratch();
  for (const starts of [[0, 2], [1]]) {
    const words = encode(
      starts.flatMap((start) => [
        { kind: "span" as const, end: start + 1, style: 0 },
        { kind: "group" as const, start, style: 1 },
      ]),
    );
    const result = extractGroups(
      { status: "ok", injections: 0, groups: 3, records: () => words },
      words,
      false,
      scratch,
    );
    equal(
      [...result.groups],
      starts.flatMap((start) => [start, start + 1, 1]),
    );
  }
});

test("records without groups compact spans and leave groups empty", () => {
  const words = encode([
    { kind: "span", end: 2, style: 0 },
    { kind: "span", end: 5, style: 1 },
  ]);
  const result = extractGroups(
    { status: "ok", injections: 0, groups: 0, records: () => words },
    words,
    true,
  );
  equal([...result.spans], [2, 0, 5, 1]);
  equal(result.groups.length, 0);
  equal(result.values, undefined);
});
