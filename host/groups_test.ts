import { test } from "avril:test";
import { ABI, decode, encode, type Manifest } from "#/abi/mod.ts";
import { puppet } from "#/testing/puppet.ts";
import { assert, equal } from "#/testing/assert.ts";
import { callJoined } from "./joined.ts";
import { Highlighter, type Callee } from "./mod.ts";

const manifest = (language: string, embeds: string[] = []): Manifest => ({
  abi: ABI,
  language,
  aliases: [],
  embeds,
  styles: [{ name: "plain" }, { name: "constant.color", tag: "co", attribute: "v" }],
  styleMap: 0,
  areaBytes: 2048,
  maxDepth: 8,
});

test("process exposes nested groups outermost first and merges spans", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest("color"), [
      {
        injections: 0,
        records: [
          { kind: "span", end: 4, style: 0 },
          { kind: "group", start: 2, style: 1 },
          { kind: "span", end: 5, style: 0 },
          { kind: "group", start: 1, style: 1 },
          { kind: "span", end: 6, style: 0 },
        ],
      },
    ]),
  );
  const result = host.process("color", "abcdef");
  assert(result.status === "ok");
  equal([...result.spans], [6, 0]);
  equal([...result.groups!], [1, 5, 1, 2, 4, 1]);
  const plain = host.process("missing", "text");
  assert(plain.status === "ok");
  equal(plain.groups, undefined);
});

test("a child's group appears inside a fence-like injection", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest("markdown", ["child"]), [
      {
        injections: 1,
        records: [
          { kind: "span", end: 3, style: 0 },
          { kind: "opens", injection: 0, embeds: 0 },
          { kind: "segment", end: 6, injection: 0, closes: true },
          { kind: "span", end: 9, style: 0 },
        ],
      },
    ]),
  );
  await host.add(
    await puppet(manifest("child"), [
      {
        injections: 0,
        records: [
          { kind: "span", end: 6, style: 0 },
          { kind: "group", start: 3, style: 1 },
        ],
      },
    ]),
  );
  const result = host.process("markdown", "```red```");
  assert(result.status === "ok");
  equal([...result.spans], [9, 0]);
  equal([...result.groups!], [3, 6, 1]);
});

test("joined documents fragment groups crossing gaps and preserve their values", () => {
  const source = new TextEncoder().encode("ab--cd");
  const callee: Callee = {
    manifest: manifest("child"),
    useStyles() {},
    call(_context, documents) {
      const start = documents[0]!;
      const words = encode([
        { kind: "span", end: start + 2, style: 0 },
        { kind: "group", start, style: 1 },
        { kind: "span", end: start + 3, style: 0 },
        { kind: "group", start: start + 2, style: 1 },
        { kind: "span", end: start + 4, style: 0 },
        { kind: "group", start, style: 1 },
      ]);
      return { status: "ok", injections: 0, groups: 3, records: () => words };
    },
  };
  const joined = callJoined(
    callee,
    { source: () => source },
    Uint32Array.of(0, 2, 1, 4, 6, 2),
    true,
  );
  assert(joined.result.status === "ok");
  equal(decode(joined.result.records()), [
    { kind: "span", end: 2, style: 0 },
    { kind: "group", start: 0, style: 1 },
    { kind: "group", start: 0, style: 1 },
    { kind: "span", end: 5, style: 0 },
    { kind: "group", start: 4, style: 1 },
    { kind: "span", end: 6, style: 0 },
    { kind: "group", start: 4, style: 1 },
  ]);
  equal([...joined.result.groupValues!.values()], ["abcd", "abcd"]);
});
