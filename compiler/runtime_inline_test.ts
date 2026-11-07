import { test } from "avril:test";
import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { equal } from "#/testing/assert.ts";
import { func, global, local, module, wat } from "#/testing/wat/mod.ts";
import {
  coalesce,
  emitGroup,
  emitSegment,
  fail,
  openInjection,
  recordWriters,
  sealHost,
} from "./runtime.ts";

async function runInline(
  action: number,
): Promise<{ words: number[]; groups: number; injections: number }> {
  const out = local("out"),
    pendingStyle = local("pending"),
    pendingEnd = local("pendingEnd");
  const pendingAddress = local("pendingAddress"),
    host = local("host"),
    hostId = local("hostId");
  const hostDepth = local("hostDepth"),
    hostLast = local("hostLast"),
    hostCurrent = local("hostCurrent");
  const depth = local("depth"),
    openAction = local("openAction"),
    openStart = local("openStart");
  const openEnd = local("openEnd"),
    end = local("end"),
    style = local("style");
  const wrapStyle = local("wrapStyle"),
    wrapStart = local("wrapStart"),
    inputAction = local("action");
  const span = { out, pendingStyle, pendingEnd, pendingAddress };
  const state = {
    span,
    host,
    hostId,
    hostDepth,
    hostLast,
    hostCurrent,
    depth,
    openAction,
    openStart,
    openEnd,
  };
  const injections = global("injections", () => wat`(export "injections") (mut i32) (i32.const 0)`);
  const groups = global("groups", () => wat`(export "groups") (mut i32) (i32.const 0)`);
  const records = recordWriters({ base: wat`(i32.const 32)`, fail });
  const locals = [
    out,
    pendingStyle,
    pendingEnd,
    pendingAddress,
    host,
    hostId,
    hostDepth,
    hostLast,
    hostCurrent,
    depth,
    openAction,
    openStart,
    openEnd,
    end,
    style,
    wrapStyle,
    wrapStart,
  ];
  const entry = func(
    "entry",
    () => wat`(export "entry") (param ${inputAction} i32) (result i32)
    ${locals.map((item) => wat`(local ${item} i32)`)}
    (local.set ${out} (i32.const 128))
    (local.set ${pendingStyle} (i32.const -1))
    (local.set ${pendingAddress} (i32.const -1))
    (local.set ${hostCurrent} (i32.const -1))
    (local.set ${hostLast} (i32.const -1))
    (local.set ${end} (i32.const 1))
    ${coalesce(span, end, style, records.emit)}
    (local.set ${end} (i32.const 2))
    ${coalesce(span, end, style, records.emit)}
    (local.set ${openAction} (local.get ${inputAction}))
    (local.set ${openStart} (i32.const 3))
    (local.set ${openEnd} (i32.const 5))
    ${openInjection(state, { ...records, fail, injections })}
    (local.set ${end} (i32.const 3))
    ${coalesce(span, end, style, records.emit)}
    (local.set ${end} (i32.const 4))
    ${emitSegment(state, end, records)}
    (local.set ${end} (i32.const 5))
    ${emitSegment(state, end, records)}
    (call ${sealHost} (local.get ${hostLast}))
    (local.set ${end} (i32.const 7))
    (local.set ${style} (i32.const 1))
    ${coalesce(span, end, style, records.emit)}
    (local.set ${wrapStart} (i32.const 6))
    ${emitGroup({ span, wrapStyle, wrapStart, hostCurrent }, end, wat`(i32.const 32)`, { ...records, groups })}
    (i32.shr_u (i32.sub (local.get ${out}) (i32.const 128)) (i32.const 3))`,
  );
  const text = module({ memory: wat`(memory (export "memory") 1)`, exports: [entry] });
  const dir = await makeTempDir();
  await writeTextFile(`${dir}/inline.wat`, text);
  await run("wat2wasm", [`${dir}/inline.wat`, "-o", `${dir}/inline.wasm`], { stderr: "inherit" });
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(await readFile(`${dir}/inline.wasm`)),
  );
  const exports = instance.exports as {
    entry(action: number): number;
    memory: WebAssembly.Memory;
    groups: WebAssembly.Global;
    injections: WebAssembly.Global;
  };
  const memory = new DataView(exports.memory.buffer);
  memory.setUint16(32, 11, true);
  memory.setUint16(34, 22, true);
  const count = exports.entry(action);
  return {
    words: [...new Uint32Array(exports.memory.buffer, 128, count * 2)],
    groups: Number(exports.groups.value),
    injections: Number(exports.injections.value),
  };
}

test("inline templates coalesce, open named injections, extend segments and emit groups", async () => {
  equal(await runInline(1), {
    words: [3, 11, 0, 0xe0000000, 3, 5, 5, 0xa0000000, 7, 22, 6, 0x4000000b],
    groups: 1,
    injections: 1,
  });
});

test("inline templates open static injections", async () => {
  equal(await runInline(2), {
    words: [3, 11, 3, 0xc0000000, 5, 0xa0000000, 7, 22, 6, 0x4000000b],
    groups: 1,
    injections: 1,
  });
});
