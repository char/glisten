import { test } from "avril:test";
import { ABI, encode, type Manifest, type OutputRecord } from "#/abi/mod.ts";
import { puppet } from "#/testing/puppet.ts";
import { assert, equal } from "#/testing/assert.ts";
import { composeWith, Highlighter, ResourceError, type Callee } from "./mod.ts";

const manifest = (
  language: string,
  styles: Manifest["styles"],
  embeds: string[] = [],
): Manifest => ({
  abi: ABI,
  language,
  aliases: [],
  embeds,
  styles,
  styleMap: 0,
  areaBytes: 2048,
  maxDepth: 8,
});
const root = manifest("root", [{ name: "plain" }, { name: "outer", tag: "o" }], ["child"]);
const child = manifest("child", [{ name: "inner", tag: "i" }]);
const rootRecords: OutputRecord[] = [
  { kind: "span", end: 1, style: 1 },
  { kind: "opens", injection: 0, embeds: 0 },
  { kind: "segment", end: 3, injection: 0, closes: true },
  { kind: "span", end: 4, style: 0 },
];
const childRecords: OutputRecord[] = [{ kind: "span", end: 3, style: 0 }];

function fake(info: Manifest, records: OutputRecord[], injections: number): Callee {
  let mapping: Uint16Array = new Uint16Array();
  return {
    manifest: info,
    useStyles: (map) => {
      mapping = map;
    },
    call: () => {
      const words = encode(
        records.map((item) =>
          item.kind === "span" ? { ...item, style: mapping[item.style]! } : item,
        ),
      );
      return { status: "ok", records: () => words, injections };
    },
  };
}

test("renders composed tags, escaping, bare styles, and byte boundaries", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(await puppet(root, [{ records: rootRecords, injections: 1 }], { repeat: true }));
  await host.add(await puppet(child, [{ records: childRecords, injections: 0 }], { repeat: true }));
  const input = "<&>x";
  const composed = composeWith(
    [fake(root, rootRecords, 1), fake(child, childRecords, 0)],
    "root",
    new TextEncoder().encode(input),
    { checks: true },
  );
  const processed = host._process("root", input);
  assert(composed.status === "ok" && processed.status === "ok");
  equal(Array.from(composed.spans), Array.from(processed.spans));
  equal(host.highlight("root", input), "<g-o>&lt;</g-o><g-i>&amp;&gt;</g-i>x");
  equal(
    host.highlight("root", new TextEncoder().encode(input)),
    "<g-o>&lt;</g-o><g-i>&amp;&gt;</g-i>x",
  );
  equal(host.highlight("root", ""), "");
});

test("first registration sets tags, including a reserved missing style", async () => {
  const host = new Highlighter({ missingStyle: "custom" });
  const first = manifest("first", [{ name: "custom", tag: "first" }]);
  const second = manifest("second", [{ name: "custom", tag: "second" }]);
  const script = [{ records: [{ kind: "span" as const, end: 1, style: 0 }], injections: 0 }];
  await host.add(await puppet(first, script, { repeat: true }));
  await host.add(await puppet(second, script, { repeat: true }));
  equal(host.highlight("missing", "&"), "<g-first>&amp;</g-first>");
  equal(host.highlight("second", "x"), "<g-first>x</g-first>");
  const missing = host._process("missing", "&");
  assert(missing.status === "ok");
  equal(missing.missing, ["missing"]);
  equal(new Highlighter().highlight("missing", "<&>"), "&lt;&amp;&gt;");

  const untagged = new Highlighter();
  await untagged.add(
    await puppet(manifest("first", [{ name: "custom" }]), script, { repeat: true }),
  );
  await untagged.add(await puppet(second, script, { repeat: true }));
  equal(untagged.highlight("second", "x"), "x");
});

test("resource failure throws", async () => {
  const host = new Highlighter();
  await host.add(
    await puppet(root, [{ records: [], injections: 0, outcome: "resource" }], {
      repeat: true,
    }),
  );
  try {
    host.highlight("root", "x");
    throw new Error("expected ResourceError");
  } catch (error) {
    assert(error instanceof ResourceError);
  }
  const result = host._process("root", "x");
  assert(result.status === "resource");

  const embedded = new Highlighter();
  await embedded.add(
    await puppet(root, [{ records: rootRecords, injections: 1 }], { repeat: true }),
  );
  await embedded.add(
    await puppet(child, [{ records: [], injections: 0, outcome: "resource" }], {
      repeat: true,
    }),
  );
  try {
    embedded.highlight("root", "abcd");
    throw new Error("expected ResourceError");
  } catch (error) {
    assert(error instanceof ResourceError);
  }
});
