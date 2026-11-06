import { test } from "avril:test";
import { makeTempDir, readFile, writeTextFile } from "avril:fs";
import { run } from "avril:std";
import { assert, equal, throws } from "../assert.ts";
import {
  wat,
  raw,
  bytes,
  print,
  func,
  global,
  data,
  label,
  local,
  module,
  type Def,
} from "./mod.ts";

async function instantiate(text: string): Promise<WebAssembly.Instance> {
  const dir = await makeTempDir();
  await writeTextFile(`${dir}/test.wat`, text);
  await run("wat2wasm", [`${dir}/test.wat`, "-o", `${dir}/test.wasm`], { stderr: "inherit" });
  return new WebAssembly.Instance(new WebAssembly.Module(await readFile(`${dir}/test.wasm`)));
}

test("unbalanced fragments throw with an excerpt", () => {
  throws(() => raw("prefix (missing"), Error, /offset 7.*prefix \(missing/);
  throws(() => raw("extra )"), Error, /offset 6.*extra/);
  throws(() => raw('"unterminated'), Error, /unterminated/);
  throws(() => raw("(; unfinished"), Error, /unfinished/);
});

test("parentheses in strings and nested comments are ignored", () => {
  raw('(func (drop (i32.const 1))) ;; )\n (; ( (; ) ;) ;) "(\\\")"');
});

test("template balance checking treats child fragments as atoms", () => {
  const child = new Proxy(wat`(nop)`, {
    get(target, property, receiver) {
      if (property === "chunks") throw new Error("Child was traversed");
      return Reflect.get(target, property, receiver);
    },
  });
  wat`(block ${child})`;
  throws(() => wat`(block ${child}`, Error, /block x/);
});

test("numbers outside the i32 literal range throw", () => {
  for (const n of [NaN, Infinity, 1.5, 0x100000000, -0x80000001])
    throws(() => wat`${n}`, Error, /number/i);
  equal(
    print(wat`${-0x80000000} ${0xffffffff} ${12345678901234567890n}`),
    "-2147483648 4294967295 12345678901234567890",
  );
});

test("bigints must fit the i64 or u64 literal range", () => {
  const min = -(1n << 63n);
  const max = (1n << 64n) - 1n;
  equal(print(wat`${min} ${max}`), `${min} ${max}`);
  throws(() => wat`${min - 1n}`, Error, /bigint/i);
  throws(() => wat`${max + 1n}`, Error, /bigint/i);
});

test("string interpolations are rejected", () => {
  throws(() => wat`${"bad" as never}`, Error, /interpolation/i);
});

test("bytes are escaped as a WAT string", () => {
  equal(print(bytes(new Uint8Array([0, 34, 255]))), '"\\00\\22\\ff"');
});

test("fresh names are deterministic and distinct per module", () => {
  const x = local("x");
  const y = label("x");
  const root = func("root", () => wat`(param ${x} i32) (block ${y} (br ${y}))`);
  const first = module({ exports: [root] });
  module({ exports: [func("other", () => wat`(param ${local("x")} i32)`)] });
  equal(module({ exports: [root] }), first);
  assert(first.includes("$x_0") && first.includes("$x_1"));
  equal(print(wat`${x} ${y} ${x}`), "$x_0 $x_1 $x_0");
  equal(print(wat`${x} ${y}`), "$x_0 $x_1");
});

test("fresh names avoid all reached definition names", () => {
  const ref = func("x_0", () => wat``);
  const x = local("x");
  const root = func("root", () => wat`(param ${x} i32) (call ${ref})`);
  const text = module({ exports: [root] });
  assert(text.includes("(param $x_1 i32)"));
  assert(text.includes("(func $x_0"));
});

test("standalone printing avoids referenced definition names", () => {
  const target = func("x_0", () => wat``);
  const name = local("x");
  equal(print(wat`${name} ${target}`), "$x_1 $x_0");
});

test("one-line definitions close on the same line", () => {
  const counter = global("counter", () => wat`(mut i32) (i32.const 0)`);
  equal(module({ exports: [counter] }), "(module\n  (global $counter (mut i32) (i32.const 0))\n)");
});

test("a trailing line comment does not swallow the definition's closing paren", async () => {
  const body = raw('(export "f") ;; comment');
  const text = module({ exports: [func("f", () => body)] });
  assert(text.includes(";; comment\n"));
  const instance = await instantiate(text);
  assert(typeof instance.exports.f === "function");
});

test("line-comment markers in strings do not force a newline", () => {
  const root = func("f", () => wat`(export ";;")`);
  equal(module({ exports: [root] }), '(module\n  (func $f (export ";;"))\n)');
});

test("indentation preserves multiline comment contents", () => {
  const body = raw('(export "f")\n(; comment\n  unchanged (\n;)\n(nop)');
  const text = module({ exports: [func("f", () => body)] });
  assert(text.includes("(; comment\n  unchanged (\n;)"));
});

test("indentation preserves multiline string contents", () => {
  const body = raw('(export "two\n  spaces")');
  const text = module({ exports: [func("f", () => body)] });
  assert(text.includes('"two\n  spaces"'));
});

test("unreferenced definitions are omitted", () => {
  const unused = func("unused", () => wat``);
  const root = func("root", () => wat``);
  assert(!module({ exports: [root] }).includes(unused.name));
});

test("mutually recursive definitions print once", () => {
  let a: Def;
  let b: Def;
  a = func("a", () => wat`(call ${b})`);
  b = func("b", () => wat`(call ${a})`);
  const text = module({ exports: [a] });
  equal((text.match(/\(func \$a/g) ?? []).length, 1);
  equal((text.match(/\(func \$b/g) ?? []).length, 1);
});

test("nested fragments retain definition references", () => {
  const leaf = func("leaf", () => wat``);
  const wrapped = wat`(call ${leaf})`;
  const root = func("root", () => wat`${[wrapped]}`);
  assert(module({ exports: [root] }).includes("(func $leaf"));
});

test("duplicate definition names throw", () => {
  throws(
    () => module({ exports: [func("a", () => wat``), func("a", () => wat``)] }),
    Error,
    /duplicate.*a/i,
  );
});

test("SIMD byte search runs", async () => {
  const byte = local("byte");
  const search = func(
    "search",
    () => wat`
    (export "search")
    (param ${byte} i32)
    (result i32)
    (i32.ctz
      (i8x16.bitmask
        (i8x16.eq
          (v128.load (i32.const 0))
          (i8x16.splat (local.get ${byte})))))`,
  );
  const instance = await instantiate(
    module({ memory: wat`(memory (export "memory") 1)`, exports: [search] }),
  );
  const memory = instance.exports.memory as WebAssembly.Memory;
  new Uint8Array(memory.buffer).set(new TextEncoder().encode("abcdefghijklmnop"));
  const find = instance.exports.search as (n: number) => number;
  equal(find(100), 3);
  equal(find(122), 32);
});

test("br_table dispatch runs", async () => {
  const n = local("n");
  const zero = label("zero");
  const one = label("one");
  const fallback = label("fallback");
  const dispatch = func(
    "dispatch",
    () => wat`
    (export "dispatch")
    (param ${n} i32)
    (result i32)
    (block ${fallback}
      (block ${one}
        (block ${zero}
          (br_table ${zero} ${one} ${fallback} (local.get ${n})))
        (return (i32.const 10)))
      (return (i32.const 20)))
    (i32.const 30)`,
  );
  const instance = await instantiate(module({ exports: [dispatch] }));
  const choose = instance.exports.dispatch as (n: number) => number;
  equal([choose(0), choose(1), choose(4)], [10, 20, 30]);
});

test("mutable global exports work", async () => {
  const counter = global("counter", () => wat`(export "counter") (mut i32) (i32.const 7)`);
  const instance = await instantiate(module({ exports: [counter] }));
  const value = instance.exports.counter as WebAssembly.Global;
  equal(value.value, 7);
  value.value = 42;
  equal(value.value, 42);
});

test("data definitions are wrapped with their names", async () => {
  const segment = data("segment", () => wat`(i32.const 0) ${bytes(new Uint8Array([65]))}`);
  const instance = await instantiate(
    module({ memory: wat`(memory (export "memory") 1)`, exports: [segment] }),
  );
  equal(new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer)[0], 65);
});
