import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { ABI, encode, memory, record, type Manifest, type OutputRecord } from "#/abi/mod.ts";
import { manifestSection } from "#/abi/manifest.ts";
import { func, global, local, module, wat, type Fragment } from "./wat/mod.ts";

/** One scripted invocation of the puppet's highlight export. */
export type PuppetCall = {
  records: readonly OutputRecord[];
  injections: number;
  outcome?: "resource" | "trap" | { grow: number };
};

/** Offset within the puppet's area where it saves its most recent call. */
export function puppetStateOffset(manifest: Manifest): number {
  return Math.ceil((manifest.styleMap + manifest.styles.length * 2) / 8) * 8;
}

/** Read the last invocation saved by a puppet; received contains ABI document pairs. */
export function readPuppetState(
  memory: WebAssembly.Memory,
  base: number,
  manifest: Manifest,
): {
  count: number;
  input: number;
  documents: number;
  output: number;
  length: number;
  received: number[];
} {
  const state = base + puppetStateOffset(manifest);
  const view = new DataView(memory.buffer);
  const count = view.getUint32(state, true);
  return {
    count,
    input: view.getUint32(state + 4, true),
    documents: view.getUint32(state + 8, true),
    output: view.getUint32(state + 12, true),
    length: view.getUint32(state + 24, true),
    received: Array.from(new Uint32Array(memory.buffer, state + 32, count * 2)),
  };
}

/** Assemble a scripted ABI module. Its area must leave room for the saved segment batch. */
export async function puppet(
  manifest: Omit<Manifest, "abi" | "maxDepth"> & Partial<Pick<Manifest, "abi" | "maxDepth">>,
  script: readonly PuppetCall[],
  options: { repeat?: boolean } = {},
): Promise<WebAssembly.Module> {
  if (options.repeat && !script.length) throw new Error("A repeating puppet needs a script");
  const complete: Manifest = { abi: ABI, maxDepth: 16, ...manifest };
  const state = puppetStateOffset(complete);
  if (state + 32 > complete.areaBytes) throw new Error("Puppet area too small for call state");
  const records = global("records", () => wat`(export "records") (mut i32) (i32.const 0)`);
  const injections = global("injections", () => wat`(export "injections") (mut i32) (i32.const 0)`);
  const hasGroups = script.some((entry) => entry.records.some((item) => item.kind === "group"));
  const groups = global("groups", () => wat`(export "groups") (mut i32) (i32.const 0)`);
  const status = global("status", () => wat`(export "status") (mut i32) (i32.const 0)`);
  const calls = global("calls", () => wat`(mut i32) (i32.const 0)`);
  const input = local("input");
  const length = local("length");
  const documents = local("documents");
  const count = local("count");
  const output = local("output");
  const index = local("index");
  const end = local("end");
  const pages = local("pages");
  const ensure = func(
    "ensure",
    () => wat`
    (param ${end} i32)
    (local ${pages} i32)
    (if (i32.gt_u (local.get ${end}) (i32.mul (memory.size) (i32.const ${memory.pageBytes})))
      (then
        (local.set ${pages}
          (i32.div_u
            (i32.add
              (i32.sub (local.get ${end}) (i32.mul (memory.size) (i32.const ${memory.pageBytes})))
              (i32.const ${memory.pageBytes - 1}))
            (i32.const ${memory.pageBytes})))
        (if (i32.eq (memory.grow (local.get ${pages})) (i32.const -1))
          (then
            (global.set ${status} (i32.const 1))
            (unreachable)))))`,
  );
  const statements: Fragment[] = script.map((entry, callIndex) => {
    const writes: Fragment[] = [];
    let offset = 0;
    for (const item of entry.records) {
      const words = encode([item]);
      for (let i = 0; i < words.length; i++) {
        let value = wat`(i32.const ${words[i]!})`;
        if (i === 1 && (item.kind === "span" || item.kind === "group")) {
          const styleOffset = complete.styleMap + item.style * 2;
          const style = wat`(i32.load16_u offset=${styleOffset} (global.get $base))`;
          value = item.kind === "group" ? wat`(i32.or (i32.const 1073741824) ${style})` : style;
        }
        writes.push(wat`(i32.store offset=${offset} (local.get ${output}) ${value})`);
        offset += 4;
      }
    }
    const grow =
      typeof entry.outcome === "object"
        ? wat`
      (if (i32.eq (memory.grow (i32.const ${entry.outcome.grow})) (i32.const -1))
        (then
          (global.set ${status} (i32.const 1))
          (unreachable)))`
        : wat``;
    const outcome =
      entry.outcome === "resource"
        ? wat`
          (global.set ${status} (i32.const 1))
          (unreachable)`
        : entry.outcome === "trap"
          ? wat`(unreachable)`
          : wat``;
    const groupCount = entry.records.filter((item) => item.kind === "group").length;
    const setGroups = hasGroups ? wat`(global.set ${groups} (i32.const ${groupCount}))` : wat``;
    return wat`
      (if (i32.eq (local.get ${index}) (i32.const ${callIndex}))
        (then
          (global.set ${injections} (i32.const ${entry.injections}))
          ${setGroups}
          ${grow}
          ${outcome}
          (call ${ensure} (i32.add (local.get ${output}) (i32.const ${offset})))
          ${writes}
          (global.set ${records} (i32.const ${offset / record.bytes}))
          (return (i32.const 0))))`;
  });
  const scriptIndex = options.repeat
    ? wat`(i32.rem_u (global.get ${calls}) (i32.const ${script.length}))`
    : wat`(global.get ${calls})`;
  const highlight = func(
    "highlight",
    () => wat`
    (export "highlight")
    (param ${input} i32)
    (param ${length} i32)
    (param ${documents} i32)
    (param ${count} i32)
    (param ${output} i32)
    (result i32)
    (local ${index} i32)
    (global.set ${status} (i32.const 0))
    (local.set ${index} ${scriptIndex})
    (global.set ${calls} (i32.add (global.get ${calls}) (i32.const 1)))
    (i32.store offset=${state} (global.get $base) (local.get ${count}))
    (i32.store offset=${state + 4} (global.get $base) (local.get ${input}))
    (i32.store offset=${state + 8} (global.get $base) (local.get ${documents}))
    (i32.store offset=${state + 12} (global.get $base) (local.get ${output}))
    (i32.store offset=${state + 24} (global.get $base) (local.get ${length}))
    (memory.copy
      (i32.add (global.get $base) (i32.const ${state + 32}))
      (local.get ${documents})
      (i32.mul (local.get ${count}) (i32.const 8)))
    ${statements}
    (unreachable)`,
  );
  const text = module({
    imports: [
      wat`(import "env" "memory" (memory 1))`,
      wat`(import "env" "base" (global $base i32))`,
    ],
    exports: [highlight],
  });
  const dir = await makeTempDir();
  await writeTextFile(`${dir}/puppet.wat`, text);
  await run("wat2wasm", [`${dir}/puppet.wat`, "-o", `${dir}/puppet.wasm`], { stderr: "inherit" });
  const wasm = new Uint8Array(await readFile(`${dir}/puppet.wasm`));
  const section = manifestSection(complete);
  const binary = new Uint8Array(wasm.length + section.length);
  binary.set(wasm);
  binary.set(section, wasm.length);
  return new WebAssembly.Module(binary);
}
