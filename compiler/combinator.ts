import type { Matcher } from "#/grammar/mod.ts";
import type { LowerContext } from "./matcher.ts";

const prefixMiss = 0;
const suffixMiss = 1;
const prefixMatched = 2;

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
    const matchers = alternative.map((item) => matcher(item, miss)).join("\n");
    return `(block ${miss} ${matchers}
        (br ${done}))
      (local.set $matchCursor (local.get ${start}))`;
  });
  const choices = alternatives.join("\n");
  return `(local.set ${start} (local.get $matchCursor))
    (block ${done} ${choices}
      (br ${fail}))`;
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
  const matchers = m.matchers.map((item) => matcher(item, miss)).join("\n");
  return `(local.set ${start} (local.get $matchCursor))
    (block ${done}
      (block ${miss} ${matchers}
        (br ${done}))
      (local.set $matchCursor (local.get ${start})))`;
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
  const cacheStart = `${cache}Start`;
  const inCachedRange = `(i32.and
    (i32.ge_u (local.get $matchCursor) (local.get ${cacheStart}))
    (i32.lt_u (local.get $matchCursor) (local.get ${cache})))`;
  // Return the end and whether the first byte missed, the suffix missed, or it matched.
  if ((prefixCounts.get(prefixKey) ?? 0) >= 2 && !m.suffix.some(needsCallerLocals)) {
    const functionKey = JSON.stringify([m, knownPrefix]);
    let fn = prefixFunctions.get(functionKey);
    if (!fn) {
      const name = `$cached${prefixFunctions.size}`;
      const first = getSaves();
      const prefix = [
        knownPrefix
          ? `(local.set $matchCursor (i32.add (local.get $matchCursor) (i32.const 1)))`
          : matcher({ kind: "one", set: m.first }, "$miss"),
        matcher({ kind: "run", set: m.rest, min: 0 }, "$miss"),
      ].join("\n");
      const suffix = m.suffix.map((n) => matcher(n, "$suffixMiss")).join("\n");
      const locals = Array.from({ length: getSaves() - first }, (_, i) => {
        const savedPosition = `$backtrack${first + i}`;
        return `(local ${savedPosition} i32)`;
      });
      const localDeclarations = locals.join(" ");
      fn = {
        name,
        code: `(func ${name} (param $input i32) (param $matchCursor i32) (param $limit i32)
          (param $docStart i32) (result i32 i32)
          (local $matchByte i32) (local $end i32)
          ${localDeclarations}
          (block $miss ${prefix}
            (local.set $end (local.get $matchCursor))
            (block $suffixMiss ${suffix}
              (return (local.get $matchCursor) (i32.const ${prefixMatched})))
            (return (local.get $end) (i32.const ${suffixMiss})))
          (i32.const 0)
          (i32.const ${prefixMiss}))`,
      };
      prefixFunctions.set(functionKey, fn);
    }
    const start = save();
    const status = save();
    const name = fn.name;
    return `(br_if ${fail} ${inCachedRange})
      (local.set ${start} (local.get $matchCursor))
      (call ${name} (local.get $input) (local.get $matchCursor) (local.get $limit) (local.get $docStart))
      (local.set ${status})
      (local.set $matchCursor)
      (if (i32.ne (local.get ${status}) (i32.const ${prefixMatched}))
        (then
          (if (local.get ${status})
            (then
              (local.set ${cacheStart} (local.get ${start}))
              (local.set ${cache} (local.get $matchCursor))))
          (br ${fail})))`;
  }
  const done = fresh("prefixDone");
  const miss = fresh("prefixMiss");
  const end = save();
  const start = save();
  const first = matcher({ kind: "one", set: m.first }, fail);
  const rest = matcher({ kind: "run", set: m.rest, min: 0 }, fail);
  const suffix = m.suffix.map((item) => matcher(item, miss)).join("\n");
  return `(br_if ${fail} ${inCachedRange})
    (local.set ${start} (local.get $matchCursor))
    ${first}
    ${rest}
    (local.set ${end} (local.get $matchCursor))
    (block ${done}
      (block ${miss} ${suffix}
        (br ${done}))
      (local.set ${cacheStart} (local.get ${start}))
      (local.set ${cache} (local.get ${end}))
      (br ${fail}))`;
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
  const matchers = m.matchers.map((item) => matcher(item, miss)).join("\n");
  return `(local.set ${start} (local.get $matchCursor))
    (block ${miss} ${matchers}
      (br ${fail}))
    (local.set $matchCursor (local.get ${start}))`;
}

export function lowerAhead(
  m: Extract<Matcher, { kind: "ahead" }>,
  fail: string,
  knownPrefix: boolean,
  context: LowerContext,
): string {
  const { save, matcher } = context;
  const start = save();
  const matchers = m.matchers.map((item) => matcher(item, fail)).join("\n");
  return `(local.set ${start} (local.get $matchCursor))
    ${matchers}
    (local.set $matchCursor (local.get ${start}))`;
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
  const miss = `${done}_miss`;
  const matchers = m.matchers.map((item) => matcher(item, miss)).join("\n");
  return `(block ${done} (loop ${more}
    (local.set ${start} (local.get $matchCursor))
    (block ${miss} ${matchers}
      (br_if ${done} (i32.eq (local.get $matchCursor) (local.get ${start})))
      (br ${more}))
    (local.set $matchCursor (local.get ${start}))))`;
}
