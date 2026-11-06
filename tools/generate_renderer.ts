import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";

const dir = await makeTempDir();
await run("wat2wasm", ["host/render.wat", "-o", `${dir}/renderer.wasm`], { stderr: "inherit" });
const bytes = await readFile(`${dir}/renderer.wasm`);
const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
await writeTextFile(
  "host/render_module.ts",
  `/** Generated from host/render.wat; verify with tools/render_module_test.ts. */\nconst encoded =\n  "${encoded}";\nexport const renderModule = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));\n`,
);
