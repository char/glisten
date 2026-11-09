import { test } from "avril:test";
import { ABI } from "#/abi/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import { puppet } from "#/testing/puppet.ts";
import { Highlighter, ResourceError } from "./mod.ts";

function language(
  name: string,
  options: { embed?: string; aliases?: string[]; resource?: boolean } = {},
): Promise<WebAssembly.Module> {
  return puppet(
    {
      abi: ABI,
      language: name,
      aliases: options.aliases ?? [],
      embeds: options.embed ? [options.embed] : [],
      styles: [{ name: "keyword", tag: "k" }],
      styleMap: 0,
      areaBytes: 2048,
      maxDepth: 8,
    },
    [
      {
        injections: options.embed ? 1 : 0,
        records: options.embed
          ? [
              { kind: "opens", injection: 0, embeds: 0 },
              { kind: "segment", injection: 0, end: 1, closes: true },
            ]
          : [{ kind: "span", end: 1, style: 0 }],
        outcome: options.resource ? "resource" : undefined,
      },
    ],
    { repeat: true },
  );
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

test("highlightFull requires a loader even when nothing needs loading", async () => {
  const error = await rejection(new Highlighter().highlightFull("root", ""));
  assert(error instanceof Error && /loadLanguage/.test(error.message));
});

test("highlightFull loads the root, aliases, and nested injections on demand, once", async () => {
  const modules = new Map([
    ["root", await language("root", { embed: "ALIAS" })],
    ["alias", await language("child", { aliases: ["alias"], embed: "leaf" })],
    ["leaf", await language("leaf")],
  ]);
  const requested: string[] = [];
  const host = new Highlighter({
    checks: true,
    loadLanguage: async (name) => {
      requested.push(name);
      return modules.get(name);
    },
  });
  equal(await host.highlightFull("ROOT", ""), "");
  equal(await host.highlightFull("ROOT", "<"), "<g-k>&lt;</g-k>");
  equal(await host.highlightFull("root", "&"), "<g-k>&amp;</g-k>");
  equal(requested, ["root", "alias", "leaf"]);
});

test("unsupported languages fall back; mislabeled modules are rejected before registration", async () => {
  const other = await language("other");
  const requested: string[] = [];
  const host = new Highlighter({
    checks: true,
    missingStyle: "keyword",
    loadLanguage: async (name) => {
      requested.push(name);
      return name === "mislabeled" ? other : undefined;
    },
  });
  await host.add(await language("root", { embed: "unsupported" }));
  equal(await host.highlightFull("root", "<"), "<g-k>&lt;</g-k>");
  const error = await rejection(host.highlightFull("mislabeled", "<"));
  assert(error instanceof Error && /does not register "mislabeled"/.test(error.message));
  equal(host.languages, ["root"]);
  equal(requested, ["unsupported", "mislabeled"]);
});

test("concurrent highlightFull calls share loads and keep their own input", async () => {
  const root = await language("root", { embed: "child" });
  const child = await language("child");
  const requested: string[] = [];
  const host = new Highlighter({
    checks: true,
    loadLanguage: async (name) => {
      requested.push(name);
      return name === "child" ? child : root;
    },
  });
  const results = Promise.all([host.highlightFull("ROOT", "<"), host.highlightFull("root", "&")]);
  equal(await results, ["<g-k>&lt;</g-k>", "<g-k>&amp;</g-k>"]);
  equal(requested, ["root", "child"]);
});

test("highlightFull propagates loader failures without caching them", async () => {
  const root = await language("root");
  const failure = new Error("network failure");
  let failed = false;
  const host = new Highlighter({
    loadLanguage: async () => {
      if (failed) return root;
      failed = true;
      throw failure;
    },
  });
  assert((await rejection(host.highlightFull("root", "x"))) === failure);
  equal(await host.highlightFull("root", "x"), "<g-k>x</g-k>");
});

test("highlightFull throws ResourceError when a loaded language runs out of resources", async () => {
  const root = await language("root", { resource: true });
  const host = new Highlighter({ loadLanguage: async () => root });
  assert((await rejection(host.highlightFull("root", "x"))) instanceof ResourceError);
});

test("disposal during loading prevents registration and rendering", async () => {
  const root = await language("root");
  const host: Highlighter = new Highlighter({
    loadLanguage: async () => {
      host.dispose();
      return root;
    },
  });
  const error = await rejection(host.highlightFull("root", "x"));
  assert(error instanceof Error && /disposed/.test(error.message));
  equal(host.languages, []);
});
