import type { Manifest } from "#/abi/schema.ts";
import type { WordEffect } from "#/grammar/word.ts";
import type { Effect } from "#/grammar/mod.ts";

export function lowerWordSelection(
  classification: WordEffect,
  lookup: (cases: WordEffect["cases"], results: readonly number[], caseless?: boolean) => string,
  branch: (effects: readonly Effect[]) => string,
): string {
  const groups = new Map<string, readonly Effect[]>();
  for (const { then } of classification.cases) groups.set(JSON.stringify(then), then);
  const keys = [...groups.keys()];
  const results = classification.cases.map(({ then }) => keys.indexOf(JSON.stringify(then)));
  return `(local.set $word (call ${lookup(classification.cases, results, classification.caseless)} (local.get $input) (local.get $pos) (local.get $p)))
        ${[...groups.values()].map((effects, i) => `(if (i32.eq (local.get $word) (i32.const ${i})) (then ${branch(effects)}))`).join("\n")}
        ${branch(classification.otherwise)}`;
}

const encoder = new TextEncoder();
const foldASCII = (value: string) =>
  `(i32.or ${value} (select (i32.const 32) (i32.const 0) (i32.lt_u (i32.sub ${value} (i32.const 65)) (i32.const 26))))`;

/** Lower a completed-word lookup to a function returning its branch index or -1. */
export function wordFunction(
  name: string,
  cases: WordEffect["cases"],
  results: readonly number[],
  strategy: "auto" | "packed" | "hash" = "auto",
  caseless = false,
): string {
  const words = cases.map(({ text }) => [...encoder.encode(text)]);
  const compare = (bytes: number[], index: number) => {
    const tests = [
      `(i32.eq (i32.sub (local.get $end) (local.get $start)) (i32.const ${bytes.length}))`,
    ];
    for (let at = 0; at < bytes.length;) {
      const width = bytes.length - at >= 4 ? 4 : bytes.length - at >= 2 ? 2 : 1;
      const value = bytes.slice(at, at + width).reduceRight((v, b) => v * 256 + b, 0) | 0;
      const load = width === 4 ? "i32.load" : width === 2 ? "i32.load16_u" : "i32.load8_u";
      const loaded = `(${load} offset=${at} (i32.add (local.get $input) (local.get $start)))`;
      const mask = bytes
        .slice(at, at + width)
        .reduce((m, b, i) => m | (b >= 97 && b <= 122 ? 32 << (8 * i) : 0), 0);
      tests.push(
        `(i32.eq ${caseless && mask ? `(i32.or ${loaded} (i32.const ${mask}))` : loaded} (i32.const ${value}))`,
      );
      at += width;
    }
    // Nested tests preserve the length guard before any loads.
    return tests.reduceRight(
      (inner, condition) => `(if ${condition} (then ${inner}))`,
      `(return (i32.const ${results[index]}))`,
    );
  };
  const prefix = `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)`;
  if (strategy === "packed" || (strategy === "auto" && words.length < 32))
    return `${prefix} ${words.map(compare).join("\n")} (i32.const -1))`;

  const hash = (bytes: number[]) =>
    bytes.reduce((h, b) => Math.imul(h ^ b, 16777619) >>> 0, 2166136261) & 255;
  const buckets = new Map<number, number[]>();
  words.forEach((bytes, i) => {
    const h = hash(bytes);
    buckets.set(h, [...(buckets.get(h) ?? []), i]);
  });
  const entries = [...buckets];
  const labels = new Map(entries.map(([h], i) => [h, `$bucket${i}`]));
  const table = Array.from({ length: 256 }, (_, i) => labels.get(i) ?? "$miss");
  const dispatch = `(br_table ${table.join(" ")} $miss (i32.and (local.get $hash) (i32.const 255)))`;
  const body = entries.reduce(
    (inner, [, indexes], i) =>
      `(block $bucket${i} ${inner}) ${indexes.map((index) => compare(words[index]!, index)).join("\n")} (br $miss)`,
    dispatch,
  );
  const min = Math.min(...words.map((bytes) => bytes.length));
  const max = Math.max(...words.map((bytes) => bytes.length));
  return `${prefix} (local $hash i32) (local $at i32)
    (if (i32.or (i32.lt_u (i32.sub (local.get $end) (local.get $start)) (i32.const ${min}))
      (i32.gt_u (i32.sub (local.get $end) (local.get $start)) (i32.const ${max}))) (then (return (i32.const -1))))
    (local.set $hash (i32.const -2128831035)) (local.set $at (local.get $start))
    (block $hashed (loop $more
      (br_if $hashed (i32.ge_u (local.get $at) (local.get $end)))
      (local.set $hash (i32.mul (i32.xor (local.get $hash) ${caseless ? foldASCII("(i32.load8_u (i32.add (local.get $input) (local.get $at)))") : "(i32.load8_u (i32.add (local.get $input) (local.get $at)))"}) (i32.const 16777619)))
      (local.set $at (i32.add (local.get $at) (i32.const 1))) (br $more)))
    (block $miss ${body}) (i32.const -1))`;
}

/** Lower a large classification to chained, exact-checked hash buckets in module scratch. */
export function wordTable(
  name: string,
  cases: WordEffect["cases"],
  results: readonly number[],
  offset: number,
  caseless = false,
): { code: string; data: string; size: number } | undefined {
  const words = cases.map(({ text }) => [...encoder.encode(text)]);
  if (
    words.some((bytes) => bytes.length > 65535) ||
    512 + words.reduce((n, bytes) => n + 8 + bytes.length, 0) > 65535
  )
    return;
  const data = Array<number>(512).fill(0);
  const set16 = (at: number, n: number) => {
    data[at] = n & 255;
    data[at + 1] = (n >>> 8) & 255;
  };
  for (const [index, bytes] of words.entries()) {
    const hash = bytes.reduce((h, byte) => Math.imul(h ^ byte, 16777619) >>> 0, 2166136261) & 255;
    const bucket = hash * 2;
    const previous = data[bucket]! | (data[bucket + 1]! << 8);
    const at = data.length;
    set16(bucket, at);
    data.push(
      previous & 255,
      previous >>> 8,
      bytes.length & 255,
      bytes.length >>> 8,
      results[index]! & 255,
      (results[index]! >>> 8) & 255,
      (results[index]! >>> 16) & 255,
      (results[index]! >>> 24) & 255,
      ...bytes,
    );
  }
  const segment = `$${name.slice(1)}data`;
  const ready = `$${name.slice(1)}ready`;
  const addr = `(i32.add (global.get $base) (i32.const ${offset}))`;
  const min = Math.min(...words.map((bytes) => bytes.length));
  const max = Math.max(...words.map((bytes) => bytes.length));
  return {
    size: data.length,
    data: `(data ${segment} "${data.map((byte) => `\\${byte.toString(16).padStart(2, "0")}`).join("")}")\n(global ${ready} (mut i32) (i32.const 0))`,
    code: `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)
      (local $len i32) (local $at i32) (local $hash i32) (local $entry i32) (local $i i32)
      (local.set $len (i32.sub (local.get $end) (local.get $start)))
      (if (i32.or (i32.lt_u (local.get $len) (i32.const ${min})) (i32.gt_u (local.get $len) (i32.const ${max}))) (then (return (i32.const -1))))
      (if (i32.eqz (global.get ${ready})) (then
        (memory.init ${segment} ${addr} (i32.const 0) (i32.const ${data.length}))
        (global.set ${ready} (i32.const 1))))
      (local.set $hash (i32.const -2128831035)) (local.set $at (local.get $start))
      (block $hashed (loop $more
        (br_if $hashed (i32.ge_u (local.get $at) (local.get $end)))
        (local.set $hash (i32.mul (i32.xor (local.get $hash) ${caseless ? foldASCII("(i32.load8_u (i32.add (local.get $input) (local.get $at)))") : "(i32.load8_u (i32.add (local.get $input) (local.get $at)))"}) (i32.const 16777619)))
        (local.set $at (i32.add (local.get $at) (i32.const 1))) (br $more)))
      (local.set $entry (i32.load16_u (i32.add ${addr} (i32.shl (i32.and (local.get $hash) (i32.const 255)) (i32.const 1)))))
      (block $miss (loop $bucket
        (br_if $miss (i32.eqz (local.get $entry)))
        (local.set $entry (i32.add ${addr} (local.get $entry)))
        (if (i32.eq (i32.load16_u offset=2 (local.get $entry)) (local.get $len)) (then
          (local.set $i (i32.const 0))
          (block $different (loop $compare
            (if (i32.ge_u (local.get $i) (local.get $len)) (then (return (i32.load offset=4 (local.get $entry)))))
            (br_if $different (i32.ne ${caseless ? foldASCII("(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $i))))") : "(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $i))))"}
              (i32.load8_u offset=8 (i32.add (local.get $entry) (local.get $i)))))
            (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $compare)))))
        (local.set $entry (i32.load16_u (local.get $entry))) (br $bucket)))
      (i32.const -1))`,
  };
}

export function wordFunctions(offset: number, manifest: Manifest) {
  let wordOffset = offset;
  const functions = new Map<string, { name: string; code: string; data?: string }>();
  const lookup = (cases: WordEffect["cases"], results: readonly number[], caseless = false) => {
    const key =
      JSON.stringify([cases.map(({ text }) => text), results]) + (caseless ? ":caseless" : "");
    let entry = functions.get(key);
    if (!entry) {
      const name = `$word${functions.size}`;
      const table =
        cases.length >= 32 ? wordTable(name, cases, results, wordOffset, caseless) : undefined;
      if (table) {
        wordOffset += table.size;
        manifest.areaBytes = Math.ceil(wordOffset / 16) * 16;
      }
      functions.set(
        key,
        (entry = {
          name,
          code: table?.code ?? wordFunction(name, cases, results, "auto", caseless),
          data: table?.data,
        }),
      );
    }
    return entry.name;
  };
  return { functions, lookup };
}
