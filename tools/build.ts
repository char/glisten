import { mkdirs, readFile, writeFile, writeTextFile } from "avril:fs";
import { basename, dirname, relative, resolve, sep } from "avril:path";
import { process, run } from "avril:std";
import { runTasks, type TaskDef } from "avril:task";
import { readManifest } from "#/abi/runtime.ts";
import { compileLanguage, type LanguageSource } from "#/compiler/mod.ts";
import { buildModule } from "./module.ts";

const { root, modules } = (await run("avril", [
  "info",
  "--include=#/languages/mod.ts",
  "tools/build.ts",
]).json()) as {
  root: string;
  modules: Record<string, { url: string; imports: Record<string, string> }>;
};
const registryPath = resolve("languages/mod.ts");

function inputs(entry: string): string[] {
  const files = new Set<string>();
  function visit(path: string): void {
    if (files.has(path)) return;
    const module = modules[path];
    if (!module?.url.startsWith("file:")) return;
    files.add(path);
    for (const child of Object.values(module.imports)) visit(child);
  }
  visit(entry);
  return Array.from(files, (path) => relative(process.cwd(), path).split(sep).join("/"));
}

const shared = new Set([
  ...inputs(root),
  "languages/mod.ts",
  "avril.conf",
  "avril.lock",
  "flake.nix",
  "flake.lock",
]);
const tasks: Record<string, TaskDef> = { compiler: { files: [...shared] } };
const names: string[] = [];
for (const entry of Object.values(modules[registryPath]!.imports)) {
  const name = basename(dirname(entry));
  names.push(name);
  tasks[`language:${name}`] = {
    dependencies: ["compiler"],
    files: inputs(entry).filter((file) => !shared.has(file)),
    output: [`dist/${name}.wat`, `dist/${name}.wasm`],
    async run() {
      const languages: Readonly<Record<string, LanguageSource>> =
        await import("#/languages/mod.ts");
      const source = languages[name];
      if (!source) throw new Error(`Expected ${entry} to be registered as ${name}`);
      const compiled = compileLanguage(source);
      if (compiled.manifest.language !== name) throw new Error(`Language name mismatch: ${name}`);
      const module = await buildModule(compiled);
      await writeTextFile(`dist/${name}.wat`, compiled.wat);
      await writeFile(`dist/${name}.wasm`, module);
    },
  };
}
names.sort((a, b) => a.localeCompare(b));
tasks.catalog = {
  dependencies: names.map((name) => `language:${name}`),
  parallel: true,
  files: [],
  output: ["dist/sizes.json", "dist/languages.json", "_generated/languages.json"],
  async run() {
    const built = await Promise.all(
      names.map(async (name) => {
        const bytes = await readFile(`dist/${name}.wasm`);
        return { name, size: bytes.length, manifest: readManifest(new WebAssembly.Module(bytes)) };
      }),
    );
    const sizes = Object.fromEntries(built.map(({ name, size }) => [name, size]));
    const catalog = built.map(({ manifest }) => ({
      language: manifest.language,
      aliases: manifest.aliases,
      extensions: manifest.extensions ?? [],
      filenames: manifest.filenames ?? [],
    }));
    const json = JSON.stringify(catalog) + "\n";
    await mkdirs("_generated");
    await Promise.all([
      writeTextFile("dist/sizes.json", JSON.stringify(sizes, null, 2) + "\n"),
      writeTextFile("dist/languages.json", json),
      writeTextFile("_generated/languages.json", json),
    ]);
  },
};

const report = await runTasks({
  all: {
    files: [...new Set([...shared, ...inputs(registryPath)])],
    output: Object.values(tasks).flatMap((task) => task.output ?? []),
    async run() {
      await mkdirs("dist");
      (await runTasks(tasks, { target: "catalog" })).throwIfFailed();
    },
  },
});
report.throwIfFailed();
