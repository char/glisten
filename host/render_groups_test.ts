import { test } from "avril:test";
import { ABI, type Manifest } from "#/abi/mod.ts";
import { puppet } from "#/testing/puppet.ts";
import { assert, equal, throws } from "#/testing/assert.ts";
import { Highlighter, ResourceError } from "./mod.ts";
import { Arena } from "./memory.ts";
import { Renderer } from "./render.ts";

const manifest: Manifest = {
  abi: ABI,
  language: "colors",
  aliases: [],
  embeds: [],
  styles: [
    { name: "plain" },
    { name: "string", tag: "s" },
    { name: "color", tag: "co", attribute: "v" },
    { name: "outer", tag: "o" },
  ],
  styleMap: 0,
  areaBytes: 2048,
  maxDepth: 8,
};

test("renders nested groups and splits spans at both boundaries", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(
      manifest,
      [
        {
          injections: 0,
          records: [
            { kind: "span", end: 7, style: 1 },
            { kind: "group", start: 1, style: 2 },
            { kind: "span", end: 8, style: 1 },
            { kind: "group", start: 0, style: 3 },
          ],
        },
      ],
      { repeat: true },
    ),
  );
  equal(
    host.highlight("colors", 'a<&"é>z'),
    '<g-o><g-s>a</g-s><g-co v="&lt;&amp;&quot;é&gt;"><g-s>&lt;&amp;"é&gt;</g-s></g-co><g-s>z</g-s></g-o>',
  );
});

test("a missing group tag is invisible even when a later module declares it", async () => {
  const host = new Highlighter();
  const first = { ...manifest, language: "first", styles: [{ name: "color" }] };
  await host.add(
    await puppet(first, [{ injections: 0, records: [{ kind: "span", end: 3, style: 0 }] }], {
      repeat: true,
    }),
  );
  await host.add(
    await puppet(
      manifest,
      [
        {
          injections: 0,
          records: [
            { kind: "span", end: 2, style: 1 },
            { kind: "group", start: 1, style: 2 },
            { kind: "span", end: 3, style: 1 },
          ],
        },
      ],
      { repeat: true },
    ),
  );
  equal(host.highlight("colors", "abc"), "<g-s>abc</g-s>");
});

test("output that cannot fit the arena is a resource failure", () => {
  const count = 1 << 18;
  const source = new TextEncoder().encode("&".repeat(count));
  const render = (limit: number) => {
    const arena = new Arena(limit);
    const renderer = new Renderer(arena);
    renderer.sync([undefined, "co"], [undefined, "v"]);
    const context = arena.place(source);
    return renderer.render(context, Uint32Array.of(count, 0), Uint32Array.of(0, count, 1));
  };
  const amps = "&amp;".repeat(count);
  equal(render(count * 32), `<g-co v="${amps}">${amps}</g-co>`);
  throws(() => render(count * 4), ResourceError);
});
