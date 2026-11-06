import { mkdirs, writeFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { compile } from "#/compiler/mod.ts";
import { languages } from "#/languages/mod.ts";
import { buildModule } from "./module.ts";

await mkdirs("dist");
const sizes: Record<string, number> = {};
await Promise.all(
  Object.entries(languages).map(async ([name, grammar]) => {
    const compiled = compile(grammar);
    const module = await buildModule(compiled);
    await writeTextFile(`dist/${name}.wat`, compiled.wat);
    await writeFile(`dist/${name}.wasm`, module);
    sizes[name] = module.length;
  }),
);
const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
await writeTextFile("dist/sizes.json", JSON.stringify(sorted, null, 2) + "\n");
await run("avril", ["bundle", "--minify", "--sourcemap", "host/mod.ts", "-o", "dist/host.js"], {
  stderr: "inherit",
});
