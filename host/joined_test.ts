import { test } from "avril:test";
import { ABI, decode, encode, segment } from "#/abi/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import type { Callee } from "./engine.ts";
import { callJoined } from "./joined.ts";

test("joined mapping preserves split closes and names at document boundaries", () => {
  const source = new TextEncoder().encode("ab--cd--ef--gh");
  const callee: Callee = {
    manifest: {
      abi: ABI,
      language: "test",
      aliases: [],
      embeds: ["child"],
      styles: [{ name: "plain" }, { name: "keyword" }],
      styleMap: 0,
      areaBytes: 0,
      maxDepth: 1,
    },
    useStyles() {},
    call(context, documents) {
      equal(Array.from(documents), [14, 18, 18, 22]);
      equal(new TextDecoder().decode(context.source().subarray(14)), "abcdefgh");
      const words = encode([
        { kind: "span", end: 15, style: 1 },
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", end: 18, injection: 0, closes: true },
        { kind: "opens", injection: 1, name: [18, 20] },
        { kind: "segment", end: 22, injection: 1, closes: true },
      ]);
      return { status: "ok", records: () => words, injections: 2 };
    },
  };
  const segments = new Uint32Array([
    0,
    2,
    segment.starts,
    4,
    6,
    segment.ends,
    8,
    10,
    segment.starts,
    12,
    14,
    segment.ends,
  ]);
  const { result } = callJoined(callee, { source: () => source }, segments, true);
  assert(result.status === "ok");
  equal(decode(result.records()), [
    { kind: "span", end: 1, style: 1 },
    { kind: "opens", injection: 0, embeds: 0 },
    { kind: "segment", end: 2, injection: 0, closes: false },
    { kind: "segment", end: 6, injection: 0, closes: true },
    { kind: "opens", injection: 1, name: [8, 10] },
    { kind: "segment", end: 10, injection: 1, closes: false },
    { kind: "segment", end: 14, injection: 1, closes: true },
  ]);
});
