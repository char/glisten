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
  const lookupName = lookup(classification.cases, results, classification.caseless);
  const branches = [...groups.values()]
    .map((effects, i) => {
      const body = branch(effects);
      return `(if (i32.eq (local.get $word) (i32.const ${i})) (then ${body}))`;
    })
    .join("\n");
  const otherwise = branch(classification.otherwise);
  return `(local.set $word (call ${lookupName} (local.get $input) (local.get $pos) (local.get $matchCursor)))
    ${branches}
    ${otherwise}`;
}

const encoder = new TextEncoder();
const fnvOffset = 0x811c9dc5;
const fnvPrime = 0x01000193;
const bucketCount = 256;
const bucketMask = bucketCount - 1;
const bucketPointerBytes = 2;
const tableHeaderBytes = bucketCount * bucketPointerBytes;
const entryLengthOffset = 2;
const entryResultOffset = 4;
const entryTextOffset = 8;
const maxTableSize = 0xffff;
const uppercaseA = "A".charCodeAt(0);
const lowercaseA = "a".charCodeAt(0);
const lowercaseZ = "z".charCodeAt(0);
const asciiCaseBit = lowercaseA - uppercaseA;
const asciiLetterCount = 26;

function hashWord(bytes: readonly number[]): number {
  return (
    bytes.reduce((hash, byte) => Math.imul(hash ^ byte, fnvPrime) >>> 0, fnvOffset) & bucketMask
  );
}
const foldASCII = (value: string) =>
  `(i32.or ${value}
    (select
      (i32.const ${asciiCaseBit})
      (i32.const 0)
      (i32.lt_u (i32.sub ${value} (i32.const ${uppercaseA})) (i32.const ${asciiLetterCount}))))`;

const foldByte = (byte: number, caseless: boolean) =>
  caseless && byte >= uppercaseA && byte < uppercaseA + asciiLetterCount
    ? byte + asciiCaseBit
    : byte;

/**
 * A word table's bucket: the hash of a word's length and its first and last bytes (folded when
 * caseless), so the lookup hashes three values instead of the whole word.
 */
function outerBucket(bytes: readonly number[], caseless: boolean): number {
  const keys = [bytes.length, foldByte(bytes[0]!, caseless), foldByte(bytes.at(-1)!, caseless)];
  return keys.reduce((hash, key) => Math.imul(hash ^ key, fnvPrime) >>> 0, fnvOffset) & bucketMask;
}

/** `outerBucket` over the input word, unmasked. */
function outerBucketInput(caseless: boolean): string {
  const firstByte = "(i32.load8_u (i32.add (local.get $input) (local.get $start)))";
  const lastByte =
    "(i32.load8_u (i32.add (local.get $input) (i32.sub (local.get $end) (i32.const 1))))";
  const keys = [
    "(local.get $length)",
    caseless ? foldASCII(firstByte) : firstByte,
    caseless ? foldASCII(lastByte) : lastByte,
  ];
  return keys.reduce(
    (hash, key) => `(i32.mul (i32.xor ${hash} ${key}) (i32.const ${fnvPrime}))`,
    `(i32.const ${fnvOffset | 0})`,
  );
}

function hashInput(caseless: boolean): string {
  const inputByte = "(i32.load8_u (i32.add (local.get $input) (local.get $cursor)))";
  const hashByte = caseless ? foldASCII(inputByte) : inputByte;
  const initial = fnvOffset | 0;
  return `(local.set $hash (i32.const ${initial}))
    (local.set $cursor (local.get $start))
    (block $hashed (loop $hashNextByte
      (br_if $hashed (i32.ge_u (local.get $cursor) (local.get $end)))
      (local.set $hash (i32.mul (i32.xor (local.get $hash) ${hashByte}) (i32.const ${fnvPrime})))
      (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
      (br $hashNextByte)))`;
}

/** Lower a completed-word lookup to a function returning its branch index or -1. */
export function wordFunction(
  name: string,
  cases: WordEffect["cases"],
  results: readonly number[],
  strategy: "auto" | "packed" | "hash" = "auto",
  caseless = false,
): string {
  const words = cases.map(({ text }) => [...encoder.encode(text)]);
  const compare = (bytes: number[], index: number, length: "known" | "checked" = "checked") => {
    const tests =
      length === "known"
        ? []
        : [`(i32.eq (i32.sub (local.get $end) (local.get $start)) (i32.const ${bytes.length}))`];
    for (let at = 0; at < bytes.length;) {
      const width = bytes.length - at >= 4 ? 4 : bytes.length - at >= 2 ? 2 : 1;
      const value = bytes.slice(at, at + width).reduceRight((v, b) => v * 256 + b, 0) | 0;
      const load = width === 4 ? "i32.load" : width === 2 ? "i32.load16_u" : "i32.load8_u";
      const offset = `offset=${at}`;
      const loaded = `(${load} ${offset} (i32.add (local.get $input) (local.get $start)))`;
      const mask = bytes
        .slice(at, at + width)
        .reduce(
          (m, b, i) => m | (b >= lowercaseA && b <= lowercaseZ ? asciiCaseBit << (8 * i) : 0),
          0,
        );
      const actual = caseless && mask ? `(i32.or ${loaded} (i32.const ${mask}))` : loaded;
      tests.push(`(i32.eq ${actual} (i32.const ${value}))`);
      at += width;
    }
    // Nested tests preserve the length guard before any loads.
    const result = results[index];
    return tests.reduceRight(
      (inner, condition) => `(if ${condition} (then ${inner}))`,
      `(return (i32.const ${result}))`,
    );
  };
  const packed = strategy === "packed" || (strategy === "auto" && words.length < 32);
  const byLength = new Map<number, number[]>();
  for (const [index, bytes] of words.entries())
    byLength.set(bytes.length, [...(byLength.get(bytes.length) ?? []), index]);
  // Enough words of several lengths: dispatch on the length once, then compare without it.
  if (packed && words.length >= 6 && byLength.size >= 2) {
    const lengths = [...byLength].sort(([a], [b]) => a - b);
    const shortest = lengths[0]![0];
    const span = lengths.at(-1)![0] - shortest + 1;
    const labels = new Map(lengths.map(([length], i) => [length, `$length${i}`]));
    const table = Array.from({ length: span }, (_, i) => labels.get(shortest + i) ?? "$miss");
    const dispatch = `(br_table ${table.join(" ")} $miss
      (i32.sub (local.get $length) (i32.const ${shortest})))`;
    const body = lengths.reduce((inner, [, indexes], i) => {
      const comparisons = indexes.map((index) => compare(words[index]!, index, "known")).join("\n");
      return `(block $length${i} ${inner})
        ${comparisons}
        (br $miss)`;
    }, dispatch);
    return `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)
      (local $length i32)
      (local.set $length (i32.sub (local.get $end) (local.get $start)))
      (block $miss ${body})
      (i32.const -1))`;
  }
  if (packed) {
    const comparisons = words.map((bytes, index) => compare(bytes, index)).join("\n");
    return `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)
      ${comparisons}
      (i32.const -1))`;
  }

  const buckets = new Map<number, number[]>();
  words.forEach((bytes, i) => {
    const h = hashWord(bytes);
    buckets.set(h, [...(buckets.get(h) ?? []), i]);
  });
  const entries = [...buckets];
  const labels = new Map(entries.map(([h], i) => [h, `$bucket${i}`]));
  const table = Array.from({ length: bucketCount }, (_, i) => labels.get(i) ?? "$miss");
  const tableLabels = table.join(" ");
  const dispatch = `(br_table ${tableLabels} $miss (i32.and (local.get $hash) (i32.const ${bucketMask})))`;
  const body = entries.reduce((inner, [, indexes], i) => {
    const label = `$bucket${i}`;
    const comparisons = indexes.map((index) => compare(words[index]!, index)).join("\n");
    return `(block ${label} ${inner})
      ${comparisons}
      (br $miss)`;
  }, dispatch);
  const min = Math.min(...words.map((bytes) => bytes.length));
  const max = Math.max(...words.map((bytes) => bytes.length));
  const hash = hashInput(caseless);
  return `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)
    (local $hash i32) (local $cursor i32)
    (if
      (i32.or
        (i32.lt_u (i32.sub (local.get $end) (local.get $start)) (i32.const ${min}))
        (i32.gt_u (i32.sub (local.get $end) (local.get $start)) (i32.const ${max})))
      (then (return (i32.const -1))))
    ${hash}
    (block $miss ${body})
    (i32.const -1))`;
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
    words.some((bytes) => bytes.length > maxTableSize) ||
    tableHeaderBytes + words.reduce((n, bytes) => n + entryTextOffset + bytes.length, 0) >
      maxTableSize
  )
    return;
  const data = Array<number>(tableHeaderBytes).fill(0);
  const set16 = (at: number, n: number) => {
    data[at] = n & 255;
    data[at + 1] = (n >>> 8) & 255;
  };
  for (const [index, bytes] of words.entries()) {
    const bucket = outerBucket(bytes, caseless) * bucketPointerBytes;
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
  const compareByte =
    "(i32.load8_u (i32.add (local.get $input) (i32.add (local.get $start) (local.get $byteIndex))))";
  const inputCompareByte = caseless ? foldASCII(compareByte) : compareByte;
  const segment = `$${name.slice(1)}data`;
  const ready = `$${name.slice(1)}ready`;
  const addr = `(i32.add (global.get $base) (i32.const ${offset}))`;
  const min = Math.min(...words.map((bytes) => bytes.length));
  const max = Math.max(...words.map((bytes) => bytes.length));
  const hash = outerBucketInput(caseless);
  const lengthOffset = `offset=${entryLengthOffset}`;
  const resultOffset = `offset=${entryResultOffset}`;
  const textOffset = `offset=${entryTextOffset}`;
  const size = data.length;
  const encoded = `"${data.map((byte) => `\\${byte.toString(16).padStart(2, "0")}`).join("")}"`;
  return {
    size,
    data: `(data ${segment} ${encoded}) \n (global ${ready} (mut i32) (i32.const 0))`,
    code: `(func ${name} (param $input i32) (param $start i32) (param $end i32) (result i32)
      (local $length i32) (local $hash i32) (local $entry i32) (local $byteIndex i32)
      (local.set $length (i32.sub (local.get $end) (local.get $start)))
      (if
        (i32.or
          (i32.lt_u (local.get $length) (i32.const ${min}))
          (i32.gt_u (local.get $length) (i32.const ${max})))
        (then (return (i32.const -1))))
      (if (i32.eqz (global.get ${ready}))
        (then
          (memory.init ${segment} ${addr} (i32.const 0) (i32.const ${size}))
          (global.set ${ready} (i32.const 1))))
      (local.set $hash ${hash})
      (local.set $entry
        (i32.load16_u
          (i32.add ${addr} (i32.shl (i32.and (local.get $hash) (i32.const ${bucketMask})) (i32.const 1)))))
      (block $miss (loop $bucket
        (br_if $miss (i32.eqz (local.get $entry)))
        (local.set $entry (i32.add ${addr} (local.get $entry)))
        (if (i32.eq (i32.load16_u ${lengthOffset} (local.get $entry)) (local.get $length))
          (then
            (local.set $byteIndex (i32.const 0))
            (block $different (loop $compare
              (if (i32.ge_u (local.get $byteIndex) (local.get $length))
                (then (return (i32.load ${resultOffset} (local.get $entry)))))
              (br_if $different
                (i32.ne ${inputCompareByte}
                  (i32.load8_u ${textOffset} (i32.add (local.get $entry) (local.get $byteIndex)))))
              (local.set $byteIndex (i32.add (local.get $byteIndex) (i32.const 1)))
              (br $compare)))))
        (local.set $entry (i32.load16_u (local.get $entry)))
        (br $bucket)))
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
