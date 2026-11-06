import type { Effect } from "#/grammar/mod.ts";
import type { ArmEffectContext } from "./arm_effect.ts";

export function lowerInjectionEffect(effect: Effect, context: ArmEffectContext): void {
  context.injections.push(...lowerInjectionActions([effect], context.rangeSlots, context.embeds));
}

/** Lower a checked raw ABI record store. */
export const emitRaw = (
  speculationScratch: boolean,
) => `(func $emitRaw (param $out i32) (param $a i32) (param $b i32) (result i32)
  (local $need i64) (local $available i64)
  (local.set $need (i64.add (i64.extend_i32_u (local.get $out)) (i64.const 8)))
  (if (i64.gt_u (local.get $need) (i64.const 4294967295)) (then (call $fail)))
  ${speculationScratch ? "(call $specReserveOutput (local.get $need))" : ""}
  (local.set $available (i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16)))
  (if (i64.gt_u (local.get $need) (local.get $available)) (then
    (if (i32.eq (memory.grow (i32.wrap_i64 (i64.shr_u (i64.add (i64.sub (local.get $need) (local.get $available)) (i64.const 65535)) (i64.const 16)))) (i32.const -1))
      (then (call $fail)))))
  (i32.store (local.get $out) (local.get $a))
  (i32.store offset=4 (local.get $out) (local.get $b))
  (i32.add (local.get $out) (i32.const 8)))`;

export function lowerInjectionActions(
  effects: readonly Effect[],
  rangeSlots: Map<string, number>,
  embeds: string[],
): string[] {
  return effects.flatMap((effect) => {
    if (effect.kind === "saveRange") {
      const i = rangeSlots.get(effect.slot.name)!;
      return [
        `(local.set $rangeStart${i} (local.get $pos)) (local.set $rangeEnd${i} (local.get $p))`,
      ];
    }
    if (effect.kind === "clearRange") {
      const i = rangeSlots.get(effect.slot.name)!;
      return [`(local.set $rangeStart${i} (i32.const 0)) (local.set $rangeEnd${i} (i32.const 0))`];
    }
    if (effect.kind === "openNamed") {
      const i = rangeSlots.get(effect.slot.name)!;
      return [
        `(local.set $openStart (local.get $rangeStart${i})) (local.set $openEnd (local.get $rangeEnd${i})) (local.set $openAction (i32.const 1))`,
      ];
    }
    if (effect.kind === "openStatic")
      return [
        `(local.set $openStart (i32.const ${embeds.indexOf(effect.language)})) (local.set $openAction (i32.const 2))`,
      ];
    if (effect.kind === "hostPrefix")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail))) (local.set $hostCurrent (i32.const -1)) (local.set $parentPaint (i32.const 1))`,
      ];
    if (effect.kind === "closeInjection")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail))) (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0)) (local.set $hostCurrent (i32.const -1))`,
      ];
    return [];
  });
}
