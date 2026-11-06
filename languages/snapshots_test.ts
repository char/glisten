import { test } from "avril:test";
import { exists, readFile, readTextFile, writeTextFile } from "avril:fs";
import { env, readDir } from "avril:std";
import { compile } from "#/compiler/mod.ts";
import { Highlighter } from "#/host/mod.ts";
import { buildModule } from "#/tools/module.ts";
import { languages } from "./mod.ts";

// Each `languages/<category>/<name>/samples/<file>` renders to the HTML in `<file>.html`.
// `avril task test:update` rewrites the snapshots; review them as ordinary diffs.
const update = env.get("GLISTEN_UPDATE_SNAPSHOTS") === "1";

// Every language is loaded, so samples also exercise their injections. Modules are built
// before any test is registered, so building is not subject to per-test timeouts.
const highlighter = new Highlighter({ checks: true });
for (const module of await Promise.all(
  Object.values(languages).map(
    async (grammar) => new WebAssembly.Module(await buildModule(compile(grammar))),
  ),
))
  await highlighter.add(module);

function compare(actual: string, expected: string, path: string): void {
  if (actual === expected) return;
  const a = actual.split("\n");
  const e = expected.split("\n");
  let line = 0;
  while (a[line] === e[line]) line++;
  throw new Error(
    `${path} differs at line ${line + 1}:\n  expected: ${e[line] ?? "<end>"}\n  actual:   ${a[line] ?? "<end>"}\n` +
      "Run `avril task test:update` to accept the new output.",
  );
}

// Languages live in `languages/<category>/<name>/`.
const directories = new Map<string, string>();
for await (const category of readDir("languages"))
  if (category.isDirectory)
    for await (const entry of readDir(`languages/${category.name}`))
      if (entry.isDirectory)
        directories.set(entry.name, `languages/${category.name}/${entry.name}`);

test("every language directory is registered", () => {
  const unregistered = [...directories.keys()].filter((name) => !(name in languages));
  if (unregistered.length) throw new Error(`Not in languages/mod.ts: ${unregistered.join(", ")}`);
});

for (const name of Object.keys(languages)) {
  const directory = `${directories.get(name) ?? `languages/?/${name}`}/samples`;
  test(`${name} has samples`, async () => {
    if (!(await exists(directory))) throw new Error(`${directory} is missing`);
  });
  if (!(await exists(directory))) continue;
  const samples: string[] = [];
  for await (const entry of readDir(directory))
    if (entry.isFile && !entry.name.endsWith(".html")) samples.push(entry.name);
  for (const sample of samples.sort()) {
    test(`${name}: ${sample}`, async () => {
      const html = highlighter.highlight(name, await readFile(`${directory}/${sample}`));
      const path = `${directory}/${sample}.html`;
      if (update) await writeTextFile(path, html);
      else if (!(await exists(path)))
        throw new Error(`${path} is missing; run \`avril task test:update\``);
      else compare(html, await readTextFile(path), path);
    });
  }
}
