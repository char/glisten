import { test } from "avril:test";
import { type Manifest, type OutputRecord } from "#/abi/mod.ts";
import { puppet } from "#/testing/puppet.ts";
import { assert, equal } from "#/testing/assert.ts";
import { Highlighter, ResourceError } from "./mod.ts";

const manifest = (language: string, styles: Manifest["styles"], embeds: string[] = []) => ({
  language,
  aliases: [],
  embeds,
  styles,
  styleMap: 0,
  areaBytes: 2048,
});

test("escape scanning stops at every span boundary, including SIMD boundaries", async () => {
  for (const count of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 31, 32, 33]) {
    const host = new Highlighter({ checks: true });
    const records: OutputRecord[] = [
      { kind: "span", end: count, style: 1 },
      { kind: "span", end: count + 1, style: 2 },
    ];
    await host.add(
      await puppet(
        manifest("root", [{ name: "plain" }, { name: "one", tag: "o" }, { name: "two", tag: "t" }]),
        [{ records, injections: 0 }],
        { repeat: true },
      ),
    );
    for (const special of ["&", "<", ">", "x"]) {
      const escaped =
        special === "&" ? "&amp;" : special === "<" ? "&lt;" : special === ">" ? "&gt;" : special;
      equal(
        host.highlight("root", "a".repeat(count) + special),
        `<g-o>${"a".repeat(count)}</g-o><g-t>${escaped}</g-t>`,
      );
      const inside = "a".repeat(count - 1) + special + "x";
      equal(
        host.highlight("root", inside),
        `<g-o>${"a".repeat(count - 1)}${escaped}</g-o><g-t>x</g-t>`,
      );
    }
  }
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(
      manifest("root", [{ name: "plain" }, { name: "one", tag: "o" }, { name: "two", tag: "t" }]),
      [
        {
          records: [
            { kind: "span", end: 8, style: 1 },
            { kind: "span", end: 16, style: 2 },
          ],
          injections: 0,
        },
      ],
      { repeat: true },
    ),
  );
  equal(host.highlight("root", "aaaaaaaabbb&bbbb"), "<g-o>aaaaaaaa</g-o><g-t>bbb&amp;bbbb</g-t>");
  const long = new Highlighter({ checks: true });
  await long.add(
    await puppet(
      manifest("root", [{ name: "plain" }, { name: "one", tag: "o" }, { name: "two", tag: "t" }]),
      [
        {
          records: [
            { kind: "span", end: 24, style: 1 },
            { kind: "span", end: 32, style: 2 },
          ],
          injections: 0,
        },
      ],
      { repeat: true },
    ),
  );
  equal(
    long.highlight("root", "a".repeat(24) + "bbb&bbbb"),
    `<g-o>${"a".repeat(24)}</g-o><g-t>bbb&amp;bbbb</g-t>`,
  );
});

test("a span merged across an embedded segment has one complete tag pair", async () => {
  const host = new Highlighter({ checks: true });
  const common = [{ name: "plain" }, { name: "shared", tag: "s" }];
  await host.add(
    await puppet(
      manifest("root", common, ["child"]),
      [
        {
          injections: 1,
          records: [
            { kind: "span", end: 1, style: 1 },
            { kind: "opens", injection: 0, embeds: 0 },
            { kind: "segment", end: 3, injection: 0, closes: true },
            { kind: "span", end: 4, style: 1 },
          ],
        },
      ],
      { repeat: true },
    ),
  );
  await host.add(
    await puppet(
      manifest("child", common),
      [{ injections: 0, records: [{ kind: "span", end: 3, style: 1 }] }],
      { repeat: true },
    ),
  );
  const result = host._process("root", "a<&b");
  assert(result.status === "ok");
  equal(Array.from(result.spans), [4, 1]);
  equal(host.highlight("root", "a<&b"), "<g-s>a&lt;&amp;b</g-s>");
});

test("renderer tables retain tags when the registry grows", async () => {
  const host = new Highlighter();
  const first = manifest("first", [{ name: "plain" }, { name: "long", tag: "long-λ-tag" }]);
  await host.add(
    await puppet(first, [{ records: [{ kind: "span", end: 1, style: 1 }], injections: 0 }], {
      repeat: true,
    }),
  );
  equal(host.highlight("first", "x"), "<g-long-λ-tag>x</g-long-λ-tag>");
  const extra = Array.from({ length: 20 }, (_, i) => ({ name: `style${i}`, tag: `t${i}` }));
  await host.add(
    await puppet(
      manifest("second", extra),
      [{ records: [{ kind: "span", end: 1, style: 19 }], injections: 0 }],
      { repeat: true },
    ),
  );
  equal(host.highlight("first", "x"), "<g-long-λ-tag>x</g-long-λ-tag>");
  equal(host.highlight("second", "x"), "<g-t19>x</g-t19>");
});

test("arena growth preserves direct module records and the source", async () => {
  const host = new Highlighter();
  await host.add(
    await puppet(
      manifest("root", [{ name: "plain" }, { name: "styled", tag: "s" }]),
      [{ records: [{ kind: "span", end: 15000, style: 1 }], injections: 0 }],
      { repeat: true },
    ),
  );
  const text = "a".repeat(15000);
  equal(host.highlight("root", text), `<g-s>${text}</g-s>`);
  const result = host._process("root", text);
  assert(result.status === "ok");
  equal(Array.from(result.spans), [15000, 1]);
});

test("renderer output exhaustion throws", async () => {
  const host = new Highlighter({ memoryLimitBytes: 4096 });
  await host.add(
    await puppet(
      manifest("root", [{ name: "plain" }]),
      [{ injections: 0, records: [{ kind: "span", end: 400, style: 0 }] }],
      { repeat: true },
    ),
  );
  const result = host._process("root", "x".repeat(400));
  assert(result.status === "ok");
  try {
    host.highlight("root", "x".repeat(400));
    throw new Error("expected ResourceError");
  } catch (error) {
    assert(error instanceof ResourceError);
  }
});
