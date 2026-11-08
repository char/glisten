import { mkdirs, writeFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { compileLanguage } from "#/compiler/language.ts";
import { languages } from "#/languages/mod.ts";
import { buildModule } from "./module.ts";

await mkdirs("dist");
const built = await Promise.all(
  Object.entries(languages).map(async ([name, load]) => {
    const { default: source } = await load();
    const compiled = compileLanguage(source);
    if (compiled.manifest.language !== name) throw new Error(`Language name mismatch: ${name}`);
    const module = await buildModule(compiled);
    await writeTextFile(`dist/${name}.wat`, compiled.wat);
    await writeFile(`dist/${name}.wasm`, module);
    return { name, size: module.length, manifest: compiled.manifest };
  }),
);
built.sort((a, b) => a.name.localeCompare(b.name));
const sizes = Object.fromEntries(built.map(({ name, size }) => [name, size]));
await writeTextFile("dist/sizes.json", JSON.stringify(sizes, null, 2) + "\n");
const catalog = built.map(({ manifest }) => ({
  language: manifest.language,
  aliases: manifest.aliases,
  extensions: manifest.extensions ?? [],
  filenames: manifest.filenames ?? [],
}));
await writeTextFile("dist/languages.json", JSON.stringify(catalog, null, 2) + "\n");
for (const [source, output] of [
  ["host/mod.ts", "dist/host.js"],
  ["filename.ts", "dist/filename.js"],
] as const)
  await run("avril", ["bundle", "--minify", "--sourcemap", source, "-o", output], {
    stderr: "inherit",
  });
