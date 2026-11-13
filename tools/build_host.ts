import { mkdirs, readFile, writeFile } from "avril:fs";
import { run } from "avril:std";

export async function buildHost(): Promise<void> {
  await mkdirs("dist");
  for (const [source, declaration, name] of [
    ["host/mod.ts", "host/browser.d.ts", "host"],
    ["filename.ts", "filename.d.ts", "filename"],
  ] as const) {
    await run("avril", ["bundle", "--minify", "--sourcemap", source, "-o", `dist/${name}.js`], {
      check: true,
      stderr: "inherit",
    });
    await writeFile(`dist/${name}.d.ts`, await readFile(declaration));
  }
}
