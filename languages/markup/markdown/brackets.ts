import { func, global, wat, type Def } from "#/testing/wat/mod.ts";
import { bracket, get } from "./layout.ts";
import { logicalRanges } from "./logical.ts";
import { inlineResource } from "./resource.ts";

/** The caller allocates a `bracket` record in scratch for each opening bracket. */
export function bracketStack(
  ranges: ReturnType<typeof logicalRanges>,
  label: Def,
  resource: ReturnType<typeof inlineResource>,
) {
  const openBracket = "[".charCodeAt(0);
  const closeBracket = "]".charCodeAt(0);
  const head = global("bracketHead", () => wat`(mut i32) (i32.const 0)`);
  const generation = global("bracketGeneration", () => wat`(mut i32) (i32.const 0)`);
  const opener = global("bracketOpener", () => wat`(mut i64) (i64.const -1)`);
  const image = global("bracketImage", () => wat`(mut i32) (i32.const 0)`);
  const form = global("bracketForm", () => wat`(mut i32) (i32.const 0)`);
  const entry = global("bracketEntry", () => wat`(mut i32) (i32.const 0)`);
  const delimiterBottom = global("bracketDelimiterBottom", () => wat`(mut i32) (i32.const 0)`);
  const reset = func(
    "bracketReset",
    () => wat`
      (global.set ${head} (i32.const 0))
      (global.set ${generation} (i32.const 0))`,
  );
  const setBelow = bracket.set(get("entry"), "below", wat`(global.get ${head})`);
  const setGeneration = bracket.set(get("entry"), "generation", wat`(global.get ${generation})`);
  const push = func(
    "bracketPush",
    () => wat`
      (param $nodes i32) (param $offset i32) (param $cursor i64) (param $image i32)
      (param $bottom i32)
      (local $entry i32)
      (local.set $entry (i32.add (local.get $nodes) (local.get $offset)))
      ${setBelow}
      ${setGeneration}
      ${bracket.set(get("entry"), "cursor", get("cursor"))}
      ${bracket.set(get("entry"), "image", get("image"))}
      ${bracket.set(get("entry"), "delimiterBottom", get("bottom"))}
      (global.set ${head} (local.get $offset))`,
  );
  const close = func(
    "bracketClose",
    () => wat`
      (param $input i32) (param $nodes i32) (param $after i64) (param $limit i32) (result i64)
      (local $entry i32) (local $offset i32) (local $cursor i64) (local $next i64)
      (local $suffix i64) (local $own i64) (local $image i32) (local $generation i32)
      (if (i32.eqz (global.get ${head})) (then (return (i64.const -1))))
      (local.set $offset (global.get ${head}))
      (local.set $entry (i32.add (local.get $nodes) (local.get $offset)))
      (global.set ${head} ${bracket.get(get("entry"), "below")})
      (local.set $generation ${bracket.get(get("entry"), "generation")})
      (local.set $cursor ${bracket.get(get("entry"), "cursor")})
      (local.set $image ${bracket.get(get("entry"), "image")})
      (if
        (i32.and
          (i32.eqz (local.get $image))
          (i32.ne (local.get $generation) (global.get ${generation})))
        (then (return (i64.const -1))))
      (local.set $next
        (call ${resource.parse} (local.get $input) (local.get $after) (local.get $limit)))
      (global.set ${form} (i32.const 0))
      (if (i64.eq (local.get $next) (i64.const -1))
        (then
          (global.set ${form} (i32.const 1))
          (local.set $next (i64.const -1))
          (if
            (i32.eq
              (call ${ranges.peek} (local.get $input) (local.get $after) (local.get $limit))
              (i32.const ${openBracket}))
            (then
              (local.set $suffix (call ${ranges.advance} (local.get $after) (local.get $limit)))
              (if
                (i32.eq
                  (call ${ranges.peek} (local.get $input) (local.get $suffix) (local.get $limit))
                  (i32.const ${closeBracket}))
                (then
                  (local.set $own
                    (call ${label}
                      (local.get $input)
                      (local.get $cursor)
                      (local.get $limit)
                      (i32.const 0)))
                  (if (i64.eq (local.get $own) (local.get $after))
                    (then
                      (local.set $next
                        (call ${ranges.advance} (local.get $suffix) (local.get $limit))))))
                (else
                  (local.set $next
                    (call ${label}
                      (local.get $input)
                      (local.get $after)
                      (local.get $limit)
                      (i32.const 0)))))))
          (if (i64.eq (local.get $next) (i64.const -1))
            (then
              (local.set $own
                (call ${label}
                  (local.get $input)
                  (local.get $cursor)
                  (local.get $limit)
                  (i32.const 0)))
              (if (i64.eq (local.get $own) (local.get $after))
                (then (local.set $next (local.get $after))))))))
      (if (i64.eq (local.get $next) (i64.const -1)) (then (return (i64.const -1))))
      (global.set ${entry} (local.get $offset))
      (global.set ${opener} (local.get $cursor))
      (global.set ${image} (local.get $image))
      (global.set ${delimiterBottom} ${bracket.get(get("entry"), "delimiterBottom")})
      (if (i32.eqz (local.get $image))
        (then (global.set ${generation} (i32.add (global.get ${generation}) (i32.const 1)))))
      (local.get $next)`,
  );
  return { reset, push, close, head, opener, image, form, entry, delimiterBottom };
}
