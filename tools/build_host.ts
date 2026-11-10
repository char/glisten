import { mkdirs } from "avril:fs";
import { run } from "avril:std";

export async function buildHost(): Promise<void> {
  await mkdirs("dist");
  for (const [source, output] of [
    ["host/mod.ts", "dist/host.js"],
    ["filename.ts", "dist/filename.js"],
  ] as const)
    await run("avril", ["bundle", "--minify", "--sourcemap", source, "-o", output], {
      stderr: "inherit",
    });
  await run(
    "deno",
    [
      "run",
      "--frozen",
      "--config=tools/declarations/deno.json",
      "--allow-read",
      "--allow-write=dist",
      "--allow-env",
      "npm:dts-bundle-generator",
      "--silent",
      "--config",
      "tools/declarations/bundle.json",
    ],
    { stderr: "inherit" },
  );
}
