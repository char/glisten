import { test } from "avril:test";
import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { assert, equal, throws } from "#/testing/assert.ts";
import { func, global, local, module, raw, wat } from "#/testing/wat/mod.ts";
import {
  charEnd,
  coalesce,
  emitGroup,
  emitSegment,
  fail,
  openInjection,
  recordWriters,
  sealHost,
  stopScan,
} from "./runtime.ts";

async function runtime() {
  const reservations = global(
    "reservations",
    () => wat`(export "reservations") (mut i32) (i32.const 0)`,
  );
  const reserve = func(
    "reserve",
    () => wat`(param $end i64)
    (global.set ${reservations} (i32.add (global.get ${reservations}) (i32.const 1)))`,
  );
  const records = recordWriters({
    base: wat`(i32.const 32)`,
    fail,
    reserveOutput: (end) => wat`(call ${reserve} ${end})`,
  });
  const { emit, emitRaw } = records;
  const small = stopScan("small", [10, 32, 42], false);
  const six = stopScan("six", [9, 10, 13, 32, 34, 35], false);
  const eight = stopScan("eight", [9, 10, 13, 32, 34, 35, 39, 40], false);
  const large = stopScan("large", [1, 2, 3, 4, 5, 6, 7, 8, 9], true);
  const high = stopScan("high", [], true);
  const roots = [
    func(
      "write",
      () => wat`(export "write") (param $out i32) (param $end i32) (param $style i32) (result i32)
      (call ${emit} (local.get $out) (local.get $end) (local.get $style))`,
    ),
    func(
      "writeRaw",
      () => wat`(export "writeRaw") (param $out i32) (param $a i32) (param $matchByte i32) (result i32)
      (call ${emitRaw} (local.get $out) (local.get $a) (local.get $matchByte))`,
    ),
    func("close", () => wat`(export "close") (param $at i32) (call ${sealHost} (local.get $at))`),
    func(
      "char",
      () => wat`(export "char") (param $matchCursor i32) (param $end i32) (result i32)
      (call ${charEnd} (i32.const 0) (local.get $matchCursor) (local.get $end))`,
    ),
    ...[small, six, eight, large, high].map((scan) => {
      const exportName = raw(JSON.stringify(scan.name));
      return func(
        `call_${scan.name}`,
        () => wat`
      (export ${exportName})
      (param $matchCursor i32) (param $end i32) (result i32)
      (call ${scan} (i32.const 0) (local.get $matchCursor) (local.get $end))`,
      );
    }),
  ];
  const text = module({ memory: wat`(memory (export "memory") 1 2)`, exports: roots });
  const dir = await makeTempDir();
  await writeTextFile(`${dir}/runtime.wat`, text);
  await run("wat2wasm", [`${dir}/runtime.wat`, "-o", `${dir}/runtime.wasm`], { stderr: "inherit" });
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(await readFile(`${dir}/runtime.wasm`)),
  );
  return instance.exports as {
    memory: WebAssembly.Memory;
    status: WebAssembly.Global;
    reservations: WebAssembly.Global;
    write(out: number, end: number, style: number): number;
    writeRaw(out: number, a: number, b: number): number;
    close(at: number): void;
    char(pos: number, end: number): number;
    small(pos: number, end: number): number;
    six(pos: number, end: number): number;
    eight(pos: number, end: number): number;
    large(pos: number, end: number): number;
    high(pos: number, end: number): number;
  };
}

test("runtime record definitions reserve, grow, map styles and close segments", async () => {
  const r = await runtime();
  new DataView(r.memory.buffer).setUint16(34, 123, true);
  equal(r.write(65532, 17, 1), 65540);
  let view = new DataView(r.memory.buffer);
  equal([view.getUint32(65532, true), view.getUint32(65536, true)], [17, 123]);
  equal(r.writeRaw(65540, 22, 0x80000003), 65548);
  r.close(65540);
  r.close(-1);
  view = new DataView(r.memory.buffer);
  equal([view.getUint32(65540, true), view.getUint32(65544, true)], [22, 0xa0000003]);
  equal(r.reservations.value, 2);
  throws(() => r.writeRaw(-8, 0, 0), WebAssembly.RuntimeError);
  equal(r.status.value, 1);
});

test("runtime character and SIMD scans work at vector and UTF-8 boundaries", async () => {
  const r = await runtime();
  const data = new Uint8Array(r.memory.buffer);
  data.fill(65, 0, 80);
  data.set([0xe2, 0x82, 0xac], 20);
  data[45] = 42;
  data[60] = 9;
  equal(r.char(20, 80), 23);
  equal(r.char(20, 22), 22);
  equal(r.small(0, 80), 45);
  equal(r.large(0, 80), 20);
  equal(r.high(0, 20), 20);
  equal(r.high(0, 80), 20);
  equal(r.large(23, 80), 60);
  assert(r.small(46, 60) === 60);
  throws(() => stopScan("bad", [], false));
  throws(() => stopScan("bad", [3, 2], true));
});

test("stop scans report the first stop of every byte set around vector boundaries", async () => {
  const r = await runtime();
  const data = new Uint8Array(r.memory.buffer);
  const scans = [
    { call: r.small, stops: [10, 32, 42], high: false },
    { call: r.six, stops: [9, 10, 13, 32, 34, 35], high: false },
    { call: r.eight, stops: [9, 10, 13, 32, 34, 35, 39, 40], high: false },
    { call: r.large, stops: [1, 2, 3, 4, 5, 6, 7, 8, 9], high: true },
    { call: r.high, stops: [], high: true },
  ];
  const offsets = [0, 1, 2, 7, 8, 14, 15, 16, 17, 23, 31, 32, 33, 47, 48, 63];
  // Filler outside every stop set, so each probe has exactly one stop.
  data.fill(65, 0, 512);
  for (const { call, stops, high } of scans) {
    equal(call(0, 512), 512);
    for (const stop of high ? [...stops, 0x80, 0xe2, 0xff] : stops) {
      for (const offset of offsets) {
        data[offset] = stop;
        equal(call(0, 64), offset);
        equal(call(offset, 64), offset);
        data[offset] = 65;
      }
    }
  }
  // Stops and high bytes sprinkled through filler, so first matches land inside the first
  // vector chunk, across chunk boundaries, and several chunks in.
  const alphabet = [9, 10, 13, 32, 34, 35, 39, 40, 42, 0x80, 0xc3, 0xe2];
  const filler = [65, 66, 99, 126, 0x7f];
  let seed = 1;
  for (let i = 0; i < 512; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fff_ffff;
    const roll = (seed >>> 16) % 100;
    const index = (seed >>> 8) % alphabet.length;
    data[i] = roll < 20 ? alphabet[index]! : filler[index % filler.length]!;
  }
  for (const { call, stops, high } of scans) {
    const set = new Set(stops);
    for (const pos of [0, 1, 15, 16, 17, 31, 33]) {
      for (const width of [0, 1, 2, 3, 5, 15, 16, 17, 31, 32, 64, 128]) {
        const end = pos + width;
        let expected = end;
        for (let i = pos; i < end; i++) {
          if (set.has(data[i]!) || (high && data[i]! >= 128)) {
            expected = i;
            break;
          }
        }
        equal(call(pos, end), expected);
      }
    }
  }
});

async function runInline(
  action: number,
): Promise<{ words: number[]; groups: number; injections: number }> {
  const out = local("out");
  const pendingStyle = local("pending");
  const pendingEnd = local("pendingEnd");
  const pendingAddress = local("pendingAddress");
  const host = local("host");
  const hostId = local("hostId");
  const hostDepth = local("hostDepth");
  const hostLast = local("hostLast");
  const hostCurrent = local("hostCurrent");
  const depth = local("depth");
  const openAction = local("openAction");
  const openStart = local("openStart");
  const openEnd = local("openEnd");
  const end = local("end");
  const style = local("style");
  const wrapStyle = local("wrapStyle");
  const wrapStart = local("wrapStart");
  const inputAction = local("action");
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
  const declarations = locals.map((item) => wat`(local ${item} i32)`);
  const mergeSpan = coalesce(span, end, style, records.emit);
  const open = openInjection(state, { ...records, fail, injections });
  const segment = emitSegment(state, end, records);
  const group = emitGroup({ span, wrapStyle, wrapStart, hostCurrent }, end, wat`(i32.const 32)`, {
    ...records,
    groups,
  });
  const entry = func(
    "entry",
    () => wat`(export "entry") (param ${inputAction} i32) (result i32)
    ${declarations}
    (local.set ${out} (i32.const 128))
    (local.set ${pendingStyle} (i32.const -1))
    (local.set ${pendingAddress} (i32.const -1))
    (local.set ${hostCurrent} (i32.const -1))
    (local.set ${hostLast} (i32.const -1))
    (local.set ${end} (i32.const 1))
    ${mergeSpan}
    (local.set ${end} (i32.const 2))
    ${mergeSpan}
    (local.set ${openAction} (local.get ${inputAction}))
    (local.set ${openStart} (i32.const 3))
    (local.set ${openEnd} (i32.const 5))
    ${open}
    (local.set ${end} (i32.const 3))
    ${mergeSpan}
    (local.set ${end} (i32.const 4))
    ${segment}
    (local.set ${end} (i32.const 5))
    ${segment}
    (call ${sealHost} (local.get ${hostLast}))
    (local.set ${end} (i32.const 7))
    (local.set ${style} (i32.const 1))
    ${mergeSpan}
    (local.set ${wrapStart} (i32.const 6))
    ${group}
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
