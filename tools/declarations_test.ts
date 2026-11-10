import { makeTempDir, readFile, writeFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { test } from "avril:test";
import { buildHost } from "./build_host.ts";

test({
  name: "browser declarations support a strict consumer without repository sources",
  timeout: 60_000,
  async fn() {
    await buildHost();
    const dir = await makeTempDir();
    for (const file of ["host.d.ts", "filename.d.ts"])
      await writeFile(`${dir}/${file}`, await readFile(`dist/${file}`));
    await writeTextFile(
      `${dir}/consumer.ts`,
      `import { Highlighter, type LanguageLoader, type Result } from "./host.js";
import { languageFor } from "./filename.js";

const loadLanguage: LanguageLoader = async () => undefined;
const host = new Highlighter({ loadLanguage });
const language: string = languageFor("example.json") ?? "json";
// @ts-expect-error filename lookup returns a name, not a numeric ID
const languageId: number | undefined = languageFor("example.json");
const source = "null";
const html: string = host.highlight(language, source);
const full: Promise<string> = host.highlightFull(language, source);
const result: Result = host.process(language, source);
if (result.status === "ok") host.render(source, result);
else {
  // @ts-expect-error a resource failure is not a renderable result
  host.render(source, result);
}
// @ts-expect-error highlight remains synchronous
const asynchronous: Promise<string> = host.highlight(language, source);
// @ts-expect-error unsupported languages use undefined, not null
new Highlighter({ loadLanguage: async () => null });
`,
    );
    await run(
      "avril-tsc",
      [
        "--noEmit",
        "--noResolve",
        "--strict",
        "--module",
        "preserve",
        "--moduleResolution",
        "bundler",
        "--lib",
        "esnext,dom",
        `${dir}/consumer.ts`,
        `${dir}/host.d.ts`,
        `${dir}/filename.d.ts`,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
  },
});
