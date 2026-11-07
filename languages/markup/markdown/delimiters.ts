import { func, wat, type Def, type Part } from "#/testing/wat/mod.ts";
import { get, match, run } from "./layout.ts";

/**
 * Resolve a source-ordered array of delimiter runs into matches.
 *
 * The caller supplies 56 zeroable bytes for openers-bottom positions and space
 * for at least half as many matches as there are delimiter bytes.
 */
export function delimiterResolver(charge: Def, permitted: Def) {
  const at = (index: string) => run.at(get("nodes"), get(index));
  const remove = func(
    "removeDelimiter",
    () => wat`
    (param $nodes i32) (param $index i32)
    (local $entry i32) (local $previous i32) (local $next i32)
    (local.set $entry ${at("index")})
    (local.set $previous ${run.get(get("entry"), "previous")})
    (local.set $next ${run.get(get("entry"), "next")})
    (if (i32.ne (local.get $previous) (i32.const -1)) (then
      ${run.set(at("previous"), "next", get("next"))}))
    (if (i32.ne (local.get $next) (i32.const -1)) (then
      ${run.set(at("next"), "previous", get("previous"))}))`,
  );
  const closer = get("closerEntry");
  const opener = get("openerEntry");
  const resolve = func(
    "resolveDelimiters",
    () => wat`
    (param $nodes i32) (param $count i32) (param $bottoms i32) (param $matches i32) (result i32)
    (local $i i32) (local $entry i32) (local $closer i32) (local $closerEntry i32) (local $opener i32) (local $openerEntry i32)
    (local $marker i32) (local $flags i32) (local $slot i32) (local $bottom i32) (local $found i32)
    (local $middle i32) (local $previous i32) (local $next i32) (local $use i32) (local $openLength i32) (local $closeLength i32)
    (local $pair i32) (local $pairs i32)
    (call ${charge} (i64.mul (i64.extend_i32_u (local.get $count)) (i64.const ${run.size})))
    (memory.fill (local.get $bottoms) (i32.const 0) (i32.const 56))
    (block $initialized (loop $initialize
      (br_if $initialized (i32.ge_u (local.get $i) (local.get $count)))
      (local.set $entry ${at("i")})
      ${run.set(get("entry"), "remaining", run.get(get("entry"), "length"))}
      ${run.set(get("entry"), "previous", wat`(i32.sub (local.get $i) (i32.const 1))`)}
      ${run.set(
        get("entry"),
        "next",
        wat`(if (result i32) (i32.lt_u (i32.add (local.get $i) (i32.const 1)) (local.get $count))
          (then (i32.add (local.get $i) (i32.const 1))) (else (i32.const -1)))`,
      )}
      ${run.set(get("entry"), "consumed", wat`(i32.const 0)`)}
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $initialize)))
    (local.set $closer (if (result i32) (local.get $count) (then (i32.const 0)) (else (i32.const -1))))
    (block $done (loop $nextCloser
      (br_if $done (i32.eq (local.get $closer) (i32.const -1)))
      (call ${charge} (i64.const 1))
      (local.set $closerEntry ${at("closer")})
      (local.set $flags ${run.get(closer, "flags")})
      (if (i32.eqz (i32.and (local.get $flags) (i32.const 2))) (then
        (local.set $closer ${run.get(closer, "next")}) (br $nextCloser)))
      (local.set $marker ${run.get(closer, "marker")})
      (local.set $slot (if (result i32) (i32.eq (local.get $marker) (i32.const 126))
        (then (i32.add (i32.const 12) (i32.sub ${run.get(closer, "length")} (i32.const 1))))
        (else (i32.add
          (if (result i32) (i32.eq (local.get $marker) (i32.const 95)) (then (i32.const 6)) (else (i32.const 0)))
          (i32.add (if (result i32) (i32.and (local.get $flags) (i32.const 1)) (then (i32.const 3)) (else (i32.const 0)))
            (i32.rem_u ${run.get(closer, "length")} (i32.const 3)))))))
      (local.set $slot (i32.add (local.get $bottoms) (i32.shl (local.get $slot) (i32.const 2))))
      (local.set $bottom (i32.load (local.get $slot)))
      (local.set $opener ${run.get(closer, "previous")})
      (local.set $found (i32.const 0))
      (block $searched (loop $search
        (br_if $searched (i32.eq (local.get $opener) (i32.const -1)))
        (call ${charge} (i64.const 1))
        (local.set $openerEntry ${at("opener")})
        (br_if $searched (i32.lt_u ${run.get(opener, "position")} (local.get $bottom)))
        (if (i32.and (i32.and ${run.get(opener, "flags")} (i32.const 1))
          (i32.eq ${run.get(opener, "marker")} (local.get $marker))) (then
          (if (if (result i32) (i32.eq (local.get $marker) (i32.const 126))
            (then (i32.eq ${run.get(opener, "length")} ${run.get(closer, "length")}))
            (else (call ${permitted} ${run.get(opener, "length")} ${run.get(closer, "length")}
              (i32.shr_u (i32.and ${run.get(opener, "flags")} (i32.const 2)) (i32.const 1))
              (i32.and (local.get $flags) (i32.const 1))))) (then
            (local.set $found (i32.const 1)) (br $searched)))))
        (local.set $opener ${run.get(opener, "previous")}) (br $search)))
      (if (i32.eqz (local.get $found)) (then
        (i32.store (local.get $slot) ${run.get(closer, "position")})
        (local.set $next ${run.get(closer, "next")})
        (if (i32.eqz (i32.and (local.get $flags) (i32.const 1))) (then (call ${remove} (local.get $nodes) (local.get $closer))))
        (local.set $closer (local.get $next)) (br $nextCloser)))
      (local.set $openLength ${run.get(opener, "remaining")})
      (local.set $closeLength ${run.get(closer, "remaining")})
      (local.set $use (if (result i32) (i32.eq (local.get $marker) (i32.const 126))
        (then (local.get $closeLength))
        (else (if (result i32) (i32.and (i32.ge_u (local.get $openLength) (i32.const 2)) (i32.ge_u (local.get $closeLength) (i32.const 2)))
          (then (i32.const 2)) (else (i32.const 1))))))
      (local.set $openLength (i32.sub (local.get $openLength) (local.get $use)))
      (local.set $closeLength (i32.sub (local.get $closeLength) (local.get $use)))
      ${run.set(opener, "remaining", get("openLength"))}
      ${run.set(closer, "remaining", get("closeLength"))}
      (local.set $pair ${match.at(get("matches"), get("pairs"))})
      ${match.set(get("pair"), "opener", get("opener"))}
      ${match.set(get("pair"), "closer", get("closer"))}
      ${match.set(get("pair"), "count", get("use"))}
      ${match.set(get("pair"), "openerOffset", wat`(i32.add (local.get $openLength) ${run.get(opener, "consumed")})`)}
      ${match.set(get("pair"), "closerOffset", run.get(closer, "consumed"))}
      ${run.set(closer, "consumed", wat`(i32.add ${run.get(closer, "consumed")} (local.get $use))`)}
      (local.set $pairs (i32.add (local.get $pairs) (i32.const 1)))
      (local.set $middle ${run.get(closer, "previous")})
      (block $removed (loop $removeMiddle
        (br_if $removed (i32.eq (local.get $middle) (local.get $opener)))
        (call ${charge} (i64.const 1))
        (local.set $previous ${run.get(at("middle"), "previous")})
        (call ${remove} (local.get $nodes) (local.get $middle))
        (local.set $middle (local.get $previous)) (br $removeMiddle)))
      (if (i32.eqz (local.get $openLength)) (then (call ${remove} (local.get $nodes) (local.get $opener))))
      (if (i32.eqz (local.get $closeLength)) (then
        (local.set $next ${run.get(closer, "next")})
        (call ${remove} (local.get $nodes) (local.get $closer))
        (local.set $closer (local.get $next))))
      (br $nextCloser)))
    (local.get $pairs)`,
  );
  return resolve;
}

/**
 * Resolve the suffix of a stack of source-node indexes. The caller removes that
 * suffix after this call. Work holds one run per suffix entry, bottoms 56 bytes,
 * and matches enough space for the resulting pairs; none may overlap.
 */
export function delimiterSuffixResolver(charge: Def, resolve: Def) {
  const stacked = (offset: Part) =>
    wat`(i32.load (i32.add (local.get $stack) (i32.shl (i32.add (local.get $bottom) ${offset}) (i32.const 2))))`;
  return func(
    "resolveDelimiterSuffix",
    () => wat`
    (param $nodes i32) (param $stack i32) (param $bottom i32) (param $count i32)
    (param $work i32) (param $bottoms i32) (param $matches i32) (result i32)
    (local $length i32) (local $i i32) (local $index i32) (local $entry i32) (local $pairs i32)
    (local.set $length (i32.sub (local.get $count) (local.get $bottom)))
    (call ${charge} (i64.mul (i64.extend_i32_u (local.get $length)) (i64.const ${run.size})))
    (block $copied (loop $copy
      (br_if $copied (i32.ge_u (local.get $i) (local.get $length)))
      (local.set $index ${stacked(get("i"))})
      (memory.copy ${run.at(get("work"), get("i"))} ${run.at(get("nodes"), get("index"))} (i32.const ${run.size}))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $copy)))
    (local.set $pairs (call ${resolve} (local.get $work) (local.get $length) (local.get $bottoms) (local.get $matches)))
    (local.set $i (i32.const 0))
    (block $mapped (loop $map
      (br_if $mapped (i32.ge_u (local.get $i) (local.get $pairs)))
      (call ${charge} (i64.const 1))
      (local.set $entry ${match.at(get("matches"), get("i"))})
      ${match.set(get("entry"), "opener", stacked(match.get(get("entry"), "opener")))}
      ${match.set(get("entry"), "closer", stacked(match.get(get("entry"), "closer")))}
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $map)))
    (local.get $pairs)`,
  );
}
