import type { Effect } from "#/grammar/mod.ts";
import type { ArmEffectContext } from "./arm_effect.ts";

export function lowerInjectionEffect(effect: Effect, context: ArmEffectContext): void {
  context.injections.push(...lowerInjectionActions([effect], context.rangeSlots, context.embeds));
}

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
