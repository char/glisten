import { test } from "avril:test";
import { makeTempDir, readFile } from "avril:fs";
import { run } from "avril:std";
import { renderModule } from "./render_module.ts";
import { equal } from "#/testing/assert.ts";

test("embedded renderer matches its WebAssembly source", async () => {
  const dir = await makeTempDir();
  await run("wat2wasm", ["host/render.wat", "-o", `${dir}/renderer.wasm`], { stderr: "inherit" });
  equal(Array.from(renderModule), Array.from(await readFile(`${dir}/renderer.wasm`)));
});
