import {
  exists,
  makeTempDir,
  makeTempFile,
  mkdirs,
  readFile,
  writeFile,
  writeTextFile,
} from "avril:fs";
import { env, rename, run } from "avril:std";
import { manifestSection, validateManifest } from "#/abi/manifest.ts";
import { validateStyleAttributes } from "#/abi/mod.ts";
import type { Compiled } from "#/compiler/mod.ts";

const pending = new Map<string, Promise<Uint8Array>>();

/**
 * Assemble and optimize a compiled grammar, attach its manifest, and validate the result.
 * Builds are cached by content hash in `GLISTEN_BUILD_CACHE` (default `.cache/modules`).
 */
export async function buildModule(
  compiled: Pick<Compiled, "wat" | "manifest">,
): Promise<Uint8Array> {
  const validation = validateManifest(compiled.manifest);
  if (validation.errors)
    throw new Error(`Invalid compiler manifest: ${JSON.stringify(validation.errors)}`);
  validateStyleAttributes(compiled.manifest.styles);
  const cache = env.get("GLISTEN_BUILD_CACHE") ?? ".cache/modules";
  await mkdirs(cache);
  const wat = new TextEncoder().encode(compiled.wat);
  const section = manifestSection(compiled.manifest);
  const input = new Uint8Array(wat.length + section.length);
  input.set(wat);
  input.set(section, wat.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const key = `${cache}/${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  let result = pending.get(key);
  if (!result) {
    result = (async () => {
      if (await exists(key)) return await readFile(key);
      const bytes = await build(compiled);
      const temporary = await makeTempFile({ dir: cache });
      await writeFile(temporary, bytes);
      await rename(temporary, key);
      return bytes;
    })();
    pending.set(key, result);
    result.catch(() => pending.delete(key));
  }
  return await result;
}

async function build(compiled: Pick<Compiled, "wat" | "manifest">): Promise<Uint8Array> {
  const dir = await makeTempDir();
  await writeTextFile(`${dir}/module.wat`, compiled.wat);
  await run("wat2wasm", [`${dir}/module.wat`, "-o", `${dir}/raw.wasm`], { stderr: "inherit" });
  await run(
    "wasm-opt",
    [
      "-O3",
      "--enable-simd",
      "--enable-bulk-memory",
      "--enable-multivalue",
      `${dir}/raw.wasm`,
      "-o",
      `${dir}/optimized.wasm`,
    ],
    { stderr: "inherit" },
  );
  const wasm = await readFile(`${dir}/optimized.wasm`);
  const section = manifestSection(compiled.manifest);
  const result = new Uint8Array(wasm.length + section.length);
  result.set(wasm);
  result.set(section, wasm.length);
  await writeFile(`${dir}/module.wasm`, result);
  await run("wasm-validate", [`${dir}/module.wasm`], { stderr: "inherit" });
  return result;
}
