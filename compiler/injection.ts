import type { Effect } from "#/grammar/mod.ts";
import type { ArmEffectContext } from "./arm_effect.ts";
import { injectionAction } from "./idioms.ts";

export function lowerInjectionEffect(effect: Effect, context: ArmEffectContext): void {
  context.injections.push(...lowerInjectionActions([effect], context.rangeSlots, context.embeds));
}

export function lowerInjectionActions(
  effects: readonly Effect[],
  rangeSlots: Map<string, number>,
  embeds: string[],
): string[] {
  return effects.flatMap((effect) => {
    if (
      effect.kind === "saveRange" ||
      effect.kind === "clearRange" ||
      effect.kind === "openNamed"
    ) {
      const index = rangeSlots.get(effect.slot.name)!;
      const start = `$rangeStart${index}`;
      const end = `$rangeEnd${index}`;
      switch (effect.kind) {
        case "saveRange":
          return [
            `(local.set ${start} (local.get $pos))
            (local.set ${end} (local.get $matchCursor))`,
          ];
        case "clearRange":
          return [
            `(local.set ${start} (i32.const 0))
            (local.set ${end} (i32.const 0))`,
          ];
        case "openNamed":
          return [
            `(local.set $openStart (local.get ${start}))
            (local.set $openEnd (local.get ${end}))
            (local.set $openAction (i32.const ${injectionAction.named}))`,
          ];
      }
    }
    if (effect.kind === "openStatic") {
      const language = embeds.indexOf(effect.language);
      return [
        `(local.set $openStart (i32.const ${language})) (local.set $openAction (i32.const ${injectionAction.static}))`,
      ];
    }
    if (effect.kind === "hostPrefix")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail)))
          (local.set $hostCurrent (i32.const -1))
          (local.set $parentPaint (i32.const 1))`,
      ];
    if (effect.kind === "closeInjection")
      return [
        `(if (i32.eqz (local.get $host)) (then (call $fail)))
          (call $sealHost (local.get $hostLast))
          (local.set $host (i32.const 0))
          (local.set $hostCurrent (i32.const -1))`,
      ];
    return [];
  });
}
