import { bytesOf, type ByteSet, type Matcher } from "#/grammar/mod.ts";
import { splat } from "./vector.ts";

type Literal = Extract<Matcher, { kind: "literal" }>;
type One = Extract<Matcher, { kind: "one" }>;
type Run = Extract<Matcher, { kind: "run" }>;
type Member = (byte: string, set: ByteSet) => string;

export function lowerLiteral(m: Literal, fail: string): string {
  const bytes = [...new TextEncoder().encode(m.text)];
  const loads: string[] = [];
  for (let at = 0; at < bytes.length;) {
    const width = bytes.length - at >= 4 ? 4 : bytes.length - at >= 2 ? 2 : 1;
    const value = bytes.slice(at, at + width).reduceRight((v, b) => v * 256 + b, 0) | 0;
    const load = width === 4 ? "i32.load" : width === 2 ? "i32.load16_u" : "i32.load8_u";
    loads.push(
      `(br_if ${fail} (i32.ne (${load} offset=${at} (i32.add (local.get $input) (local.get $p))) (i32.const ${value})))`,
    );
    at += width;
  }
  return `(br_if ${fail} (i32.lt_u (i32.sub (local.get $limit) (local.get $p)) (i32.const ${bytes.length})))
          ${loads.join("\n")}
          (local.set $p (i32.add (local.get $p) (i32.const ${bytes.length})))`;
}

export function lowerOne(m: One, fail: string, member: Member): string {
  return `(br_if ${fail} (i32.ge_u (local.get $p) (local.get $limit)))
          (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
          (br_if ${fail} (i32.eqz ${member("(local.get $b)", m.set)}))
          (local.set $p (i32.add (local.get $p) (i32.const 1)))`;
}

export function lowerCharacter(fail: string): string {
  return `(br_if ${fail} (i32.ge_u (local.get $p) (local.get $limit)))
          (local.set $p (call $charEnd (local.get $input) (local.get $p) (local.get $limit)))`;
}

export function lowerRun(
  m: Run,
  fail: string,
  context: {
    member: Member;
    fresh: (hint: string) => string;
    save: () => string;
    rangesOf: (bytes: number[]) => [number, number][];
    runFunctions: Map<string, { name: string; code: string }>;
    runCounts: Map<string, number>;
  },
): string {
  const { member, fresh, save, rangesOf, runFunctions, runCounts } = context;
  const bytes = bytesOf(m.set);
  const key = bytes.join(",");
  if (m.untilColumn !== undefined) {
    const start = save();
    const done = fresh("columnRun");
    return `(local.set ${start} (local.get $p))
      (local.set $matchColumn (call $advanceColumn (local.get $input) (local.get $pos) (local.get $p) (local.get $column)))
      (block ${done} (loop ${done}_more
        (br_if ${done} (i32.ge_u (local.get $p) (local.get $limit)))
        ${m.max === undefined ? "" : `(br_if ${done} (i32.ge_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.max})))`}
        (br_if ${done} (i64.ge_u (i64.and (local.get $matchColumn) (i64.const 4611686018427387903)) (i64.const ${m.untilColumn})))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
        (br_if ${done} (i32.eqz ${member("(local.get $b)", m.set)}))
        (local.set $matchColumn (if (result i64)
          (i32.lt_u (i32.sub (local.get $b) (i32.const 32)) (i32.const 95))
          (then (i64.add (i64.and (local.get $matchColumn) (i64.const 4611686018427387903)) (i64.const 1)))
          (else (call $advanceColumn (local.get $input) (local.get $p) (i32.add (local.get $p) (i32.const 1)) (local.get $matchColumn)))))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br ${done}_more)))
      ${m.min ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.min})))` : ""}`;
  }
  // An empty byte set cannot benefit from a vector scan.
  if ((m.max === undefined || m.max >= 16) && bytes.some((b) => b <= 255)) {
    const vectorKey = `simd:${key}`;
    let fn = runFunctions.get(vectorKey);
    if (!fn) {
      const name = `$run${runFunctions.size}`;
      const vectorBytes = bytes.filter((b) => b <= 255);
      const vector =
        vectorBytes.length <= 8
          ? vectorBytes
              .map((b) => `(i8x16.eq (local.get $chunk) ${splat(b)})`)
              .reduce((a, b) => `(v128.or ${a} ${b})`)
          : (() => {
              const low = [Array(16).fill(0), Array(16).fill(0)];
              for (const b of vectorBytes) low[b >> 7]![b & 15] |= 1 << ((b >> 4) & 7);
              const high = [Array(16).fill(0), Array(16).fill(0)];
              for (let i = 0; i < 16; i++) high[i >> 3]![i] = 1 << (i & 7);
              const part = (i: number) => `(v128.and
                    (i8x16.swizzle (v128.const i8x16 ${low[i]!.join(" ")}) (local.get $lo))
                    (i8x16.swizzle (v128.const i8x16 ${high[i]!.join(" ")}) (local.get $hi)))`;
              return `(i8x16.ne (v128.or ${part(0)} ${part(1)}) ${splat(0)})`;
            })();
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $p i32) (param $limit i32) (result i32)
                (local $b i32) (local $mask i32) (local $chunk v128) (local $lo v128) (local $hi v128)
                (block $done
                  (block $tail (loop $vectors
                    (br_if $tail (i32.lt_u (i32.sub (local.get $limit) (local.get $p)) (i32.const 16)))
                    (local.set $chunk (v128.load (i32.add (local.get $input) (local.get $p))))
                    (local.set $lo (v128.and (local.get $chunk) ${splat(15)}))
                    (local.set $hi (v128.and (i16x8.shr_u (local.get $chunk) (i32.const 4)) ${splat(15)}))
                    (local.set $mask (i32.xor (i8x16.bitmask ${vector}) (i32.const 65535)))
                    (if (local.get $mask) (then
                      (local.set $p (i32.add (local.get $p) (i32.ctz (local.get $mask)))) (br $done)))
                    (local.set $p (i32.add (local.get $p) (i32.const 16))) (br $vectors)))
                  (loop $scalar
                    (br_if $done (i32.ge_u (local.get $p) (local.get $limit)))
                    (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
                    (br_if $done (i32.eqz ${member("(local.get $b)", m.set)}))
                    (local.set $p (i32.add (local.get $p) (i32.const 1))) (br $scalar)))
                (local.get $p))`,
      };
      runFunctions.set(vectorKey, fn);
    }
    const start = m.min ? save() : undefined;
    const end =
      m.max === undefined
        ? "(local.get $limit)"
        : `(if (result i32)
            (i32.lt_u (i32.sub (local.get $limit) (local.get $p)) (i32.const ${m.max}))
            (then (local.get $limit)) (else (i32.add (local.get $p) (i32.const ${m.max}))))`;
    return `${start ? `(local.set ${start} (local.get $p))` : ""}
            (local.set $p (call ${fn.name} (local.get $input) (local.get $p) ${end}))
            ${start ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.min})))` : ""}`;
  }
  // Nix size experiment: share reused multi-range runs, leaving simple classes inline.
  if (
    m.max === undefined &&
    (runCounts.get(key) ?? 0) >= 2 &&
    rangesOf(bytesOf(m.set)).length >= 4
  ) {
    let fn = runFunctions.get(key);
    if (!fn) {
      const name = `$run${runFunctions.size}`;
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $p i32) (param $limit i32) (result i32)
              (local $b i32)
              (block $done (loop $more
                (br_if $done (i32.ge_u (local.get $p) (local.get $limit)))
                (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
                (br_if $done (i32.eqz ${member("(local.get $b)", m.set)}))
                (local.set $p (i32.add (local.get $p) (i32.const 1))) (br $more)))
              (local.get $p))`,
      };
      runFunctions.set(key, fn);
    }
    const start = m.min ? save() : undefined;
    return `${start ? `(local.set ${start} (local.get $p))` : ""}
            (local.set $p (call ${fn.name} (local.get $input) (local.get $p) (local.get $limit)))
            ${start ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.min})))` : ""}`;
  }
  const start = save();
  const done = fresh("run");
  // A long bound is clamped once, so the loop tests one end per byte.
  const bound = m.max !== undefined && m.max >= 4 ? save() : undefined;
  const end = bound ?? "$limit";
  return `(local.set ${start} (local.get $p))
          ${
            bound === undefined
              ? ""
              : `(local.set ${bound} (if (result i32) (i32.gt_u (i32.add (local.get $p) (i32.const ${m.max})) (local.get $limit))
                  (then (local.get $limit)) (else (i32.add (local.get $p) (i32.const ${m.max})))))`
          }
          (block ${done} (loop ${done}_more
            (br_if ${done} (i32.ge_u (local.get $p) (local.get ${end})))
            ${bound === undefined && m.max !== undefined ? `(br_if ${done} (i32.ge_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.max})))` : ""}
            (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $p))))
            (br_if ${done} (i32.eqz ${member("(local.get $b)", m.set)}))
            (local.set $p (i32.add (local.get $p) (i32.const 1)))
            (br ${done}_more)))
          ${m.min ? `(br_if ${fail} (i32.lt_u (i32.sub (local.get $p) (local.get ${start})) (i32.const ${m.min})))` : ""}`;
}
