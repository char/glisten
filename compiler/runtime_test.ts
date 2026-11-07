import { test } from "avril:test";
import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { assert, equal, throws } from "#/testing/assert.ts";
import { func, global, module, raw, wat } from "#/testing/wat/mod.ts";
import { charEnd, fail, recordWriters, sealHost, stopScan } from "./runtime.ts";

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
  const small = stopScan("small", [10, 32, 42], false);
  const large = stopScan("large", [1, 2, 3, 4, 5, 6, 7, 8, 9], true);
  const high = stopScan("high", [], true);
  const roots = [
    func(
      "write",
      () => wat`(export "write") (param $out i32) (param $end i32) (param $style i32) (result i32)
      (call ${records.emit} (local.get $out) (local.get $end) (local.get $style))`,
    ),
    func(
      "writeRaw",
      () => wat`(export "writeRaw") (param $out i32) (param $a i32) (param $b i32) (result i32)
      (call ${records.emitRaw} (local.get $out) (local.get $a) (local.get $b))`,
    ),
    func("close", () => wat`(export "close") (param $at i32) (call ${sealHost} (local.get $at))`),
    func(
      "char",
      () => wat`(export "char") (param $p i32) (param $end i32) (result i32)
      (call ${charEnd} (i32.const 0) (local.get $p) (local.get $end))`,
    ),
    ...[small, large, high].map((scan) =>
      func(
        `call_${scan.name}`,
        () => wat`
      (export ${raw(JSON.stringify(scan.name))})
      (param $p i32) (param $end i32) (result i32)
      (call ${scan} (i32.const 0) (local.get $p) (local.get $end))`,
      ),
    ),
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
