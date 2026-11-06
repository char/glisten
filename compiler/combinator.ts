import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";

export function prefixCacheFunctions() {
  return {
    caches: new Map<string, string>(),
    counts: new Map<string, number>(),
    functions: new Map<string, { name: string; code: string }>(),
  };
}

export function lowerEither(
  m: Extract<Matcher, { kind: "either" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, save, matcher } = context;
  const start = save();
  const done = fresh("either");
  const alternatives = m.alternatives.map((alternative) => {
    const miss = fresh("alternative");
    return `(block ${miss} ${alternative.map((n) => matcher(n, miss)).join("\n")} (br ${done}))
            (local.set $p (local.get ${start}))`;
  });
  return `(local.set ${start} (local.get $p))
          (block ${done} ${alternatives.join("\n")} (br ${fail}))`;
}

export function lowerOpt(
  m: Extract<Matcher, { kind: "opt" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, save, matcher } = context;
  const start = save();
  const done = fresh("opt");
  const miss = fresh("miss");
  return `(local.set ${start} (local.get $p))
          (block ${done} (block ${miss} ${m.matchers.map((n) => matcher(n, miss)).join("\n")} (br ${done}))
            (local.set $p (local.get ${start})))`;
}

export function lowerCachedPrefix(
  m: Extract<Matcher, { kind: "cachedPrefix" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const {
    fresh,
    save,
    prefix: { caches: prefixCaches, counts: prefixCounts, functions: prefixFunctions },
    needsCallerLocals,
    matcher,
    getSaves,
  } = context;
  let cache = prefixCaches.get(m.name);
  if (!cache) prefixCaches.set(m.name, (cache = `$prefix${prefixCaches.size}`));
  const prefixKey = JSON.stringify(m);
  // Return the end and whether the first byte missed, the suffix missed, or it matched.
  if ((prefixCounts.get(prefixKey) ?? 0) >= 2 && !m.suffix.some(needsCallerLocals)) {
    const functionKey = JSON.stringify([m, knownPrefix]);
    let fn = prefixFunctions.get(functionKey);
    if (!fn) {
      const name = `$cached${prefixFunctions.size}`;
      const first = getSaves();
      const prefix = [
        knownPrefix
          ? `(local.set $p (i32.add (local.get $p) (i32.const 1)))`
          : matcher({ kind: "one", set: m.first }, "$miss"),
        matcher({ kind: "run", set: m.rest, min: 0 }, "$miss"),
      ].join("\n");
      const suffix = m.suffix.map((n) => matcher(n, "$suffixMiss")).join("\n");
      const locals = Array.from(
        { length: getSaves() - first },
        (_, i) => `(local $q${first + i} i32)`,
      );
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $p i32) (param $limit i32) (param $docStart i32) (result i32 i32)
              (local $b i32) (local $end i32) ${locals.join(" ")}
              (block $miss
                ${prefix}
                (local.set $end (local.get $p))
                (block $suffixMiss ${suffix} (return (local.get $p) (i32.const 2)))
                (return (local.get $end) (i32.const 1)))
              (i32.const 0) (i32.const 0))`,
      };
      prefixFunctions.set(functionKey, fn);
    }
    const start = save();
    const status = save();
    return `(br_if ${fail} (i32.and (i32.ge_u (local.get $p) (local.get ${cache}Start)) (i32.lt_u (local.get $p) (local.get ${cache}))))
            (local.set ${start} (local.get $p))
            (call ${fn.name} (local.get $input) (local.get $p) (local.get $limit) (local.get $docStart))
            (local.set ${status}) (local.set $p)
            (if (i32.ne (local.get ${status}) (i32.const 2)) (then
              (if (local.get ${status}) (then (local.set ${cache}Start (local.get ${start})) (local.set ${cache} (local.get $p))))
              (br ${fail})))`;
  }
  const done = fresh("prefixDone");
  const miss = fresh("prefixMiss");
  const end = save();
  const start = save();
  return `(br_if ${fail} (i32.and (i32.ge_u (local.get $p) (local.get ${cache}Start)) (i32.lt_u (local.get $p) (local.get ${cache}))))
          (local.set ${start} (local.get $p))
          ${matcher({ kind: "one", set: m.first }, fail)}
          ${matcher({ kind: "run", set: m.rest, min: 0 }, fail)}
          (local.set ${end} (local.get $p))
          (block ${done} (block ${miss}
            ${m.suffix.map((n) => matcher(n, miss)).join("\n")}
            (br ${done}))
            (local.set ${cache}Start (local.get ${start}))
            (local.set ${cache} (local.get ${end})) (br ${fail}))`;
}

export function lowerNotAhead(
  m: Extract<Matcher, { kind: "notAhead" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, save, matcher } = context;
  const start = save();
  const miss = fresh("notAhead");
  return `(local.set ${start} (local.get $p))
          (block ${miss} ${m.matchers.map((n) => matcher(n, miss)).join("\n")} (br ${fail}))
          (local.set $p (local.get ${start}))`;
}

export function lowerAhead(
  m: Extract<Matcher, { kind: "ahead" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { save, matcher } = context;
  const start = save();
  return `(local.set ${start} (local.get $p))
          ${m.matchers.map((n) => matcher(n, fail)).join("\n")}
          (local.set $p (local.get ${start}))`;
}

export function lowerMany(
  m: { readonly matchers: readonly Matcher[] },
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { fresh, save, matcher } = context;
  const start = save();
  const done = fresh("repeat");
  const more = fresh("more");
  return `(block ${done} (loop ${more}
          (local.set ${start} (local.get $p))
          (block ${done}_miss
            ${m.matchers.map((n) => matcher(n, `${done}_miss`)).join("\n")}
            (br_if ${done} (i32.eq (local.get $p) (local.get ${start})))
            (br ${more}))
          (local.set $p (local.get ${start}))))`;
}
