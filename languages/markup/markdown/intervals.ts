import { func, wat, type Def } from "#/testing/wat/mod.ts";
import { get, interval } from "./layout.ts";

/** Insert into a caller-reserved array ordered by start ascending, then end descending. */
export function insertInterval(charge: Def) {
  return func(
    "insertInterval",
    () => wat`
    (param $base i32) (param $count i32) (param $start i32) (param $end i32) (param $style i32)
    (local $index i32) (local $previous i32) (local $entry i32)
    (local.set $index (local.get $count))
    (block $found (loop $search
      (br_if $found (i32.eqz (local.get $index)))
      (call ${charge} (i64.const 1))
      (local.set $previous (i32.sub (local.get $index) (i32.const 1)))
      (local.set $entry ${interval.at(get("base"), get("previous"))})
      (br_if $found (i32.or
        (i32.lt_u ${interval.get(get("entry"), "start")} (local.get $start))
        (i32.and (i32.eq ${interval.get(get("entry"), "start")} (local.get $start))
          (i32.ge_u ${interval.get(get("entry"), "end")} (local.get $end)))))
      (memory.copy ${interval.at(get("base"), get("index"))} (local.get $entry) (i32.const ${interval.size}))
      (local.set $index (local.get $previous))
      (br $search)))
    (local.set $entry ${interval.at(get("base"), get("index"))})
    ${interval.set(get("entry"), "start", get("start"))}
    ${interval.set(get("entry"), "end", get("end"))}
    ${interval.set(get("entry"), "style", get("style"))}`,
  );
}
