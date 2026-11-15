import type { Style } from "./styles.ts";
import type { RunSlot, CounterSlot, ColumnSlot, RangeSlot, FooterIndent } from "./slots.ts";

export type RecordEffect =
  | { readonly kind: "paint"; readonly style: Style }
  | { readonly kind: "markRecord" }
  | { readonly kind: "patchRecord"; readonly style: Style }
  | { readonly kind: "wrap"; readonly style: Style; readonly from: "frame" | "arm" };

export const paint = (style: Style): Effect => ({ kind: "paint", style });
export const markRecord = (): Effect => ({ kind: "markRecord" });
export const patchRecord = (style: Style): Effect => ({ kind: "patchRecord", style });

export const wrap = (style: Style, options: { from?: "arm" } = {}): Effect => ({
  kind: "wrap",
  style,
  from: options.from ?? "frame",
});

export type StateEffect =
  | { readonly kind: "push"; readonly state: string }
  | { readonly kind: "pop"; readonly fallback?: string }
  | { readonly kind: "goto"; readonly state: string }
  | { readonly kind: "resource" };

export const pushState = (state: string): Effect => ({ kind: "push", state });
export const popState = (options: { atRoot?: string } = {}): Effect =>
  options.atRoot === undefined ? { kind: "pop" } : { kind: "pop", fallback: options.atRoot };
export const setState = (state: string): Effect => ({ kind: "goto", state });
export const resource = (): Effect => ({ kind: "resource" });

export type SpeculationEffect =
  | {
      readonly kind: "speculate";
      readonly state: string;
      readonly group?: string;
      readonly isolate?: { readonly base: string; readonly group: string };
    }
  | { readonly kind: "abandon" };

export const speculate = (
  state: string,
  group?: string,
  isolate?: { readonly base: string; readonly group: string },
): SpeculationEffect => ({ kind: "speculate", state, group, isolate });
export const abandon = (): SpeculationEffect => ({ kind: "abandon" });

export type WordEffect = {
  readonly kind: "word";
  readonly cases: readonly { readonly text: string; readonly then: readonly Effect[] }[];
  readonly otherwise: readonly Effect[];
  readonly caseless?: boolean;
};

export function classify(
  cases: readonly { readonly text: string; readonly then: readonly Effect[] }[],
  otherwise: readonly Effect[],
  options: { readonly caseless?: boolean } = {},
): WordEffect {
  return options.caseless
    ? { kind: "word", cases, otherwise, caseless: true }
    : { kind: "word", cases, otherwise };
}

export type RangeEffect =
  | { readonly kind: "saveRange"; readonly slot: RangeSlot }
  | { readonly kind: "clearRange"; readonly slot: RangeSlot };
export type InjectionEffect =
  | { readonly kind: "openNamed"; readonly slot: RangeSlot }
  | { readonly kind: "openStatic"; readonly language: string }
  | { readonly kind: "hostPrefix" }
  | { readonly kind: "closeInjection" };

export const saveRange = (slot: RangeSlot): RangeEffect => ({ kind: "saveRange", slot });
export const clearRange = (slot: RangeSlot): RangeEffect => ({ kind: "clearRange", slot });
export const openInjection = (
  target: { named: RangeSlot; static?: never } | { static: string; named?: never },
): InjectionEffect =>
  target.named !== undefined
    ? { kind: "openNamed", slot: target.named }
    : { kind: "openStatic", language: target.static };
export const hostPrefix = (): InjectionEffect => ({ kind: "hostPrefix" });
export const closeInjection = (): InjectionEffect => ({ kind: "closeInjection" });

export type CaptureRun = { readonly kind: "captureRun"; readonly slot: RunSlot };

export const saveRun = (slot: RunSlot): CaptureRun => ({ kind: "captureRun", slot });

export type CaptureColumn = { readonly kind: "captureColumn"; readonly slot: ColumnSlot };

export const saveColumn = (slot: ColumnSlot): CaptureColumn => ({ kind: "captureColumn", slot });

export type CounterEffect =
  | { readonly kind: "counterReset"; readonly slot: CounterSlot }
  | { readonly kind: "counterIncrement"; readonly slot: CounterSlot }
  | { readonly kind: "counterDecrement"; readonly slot: CounterSlot };

export const counterReset = (slot: CounterSlot): CounterEffect => ({ kind: "counterReset", slot });
export const counterIncrement = (slot: CounterSlot): CounterEffect => ({
  kind: "counterIncrement",
  slot,
});
export const counterDecrement = (slot: CounterSlot): CounterEffect => ({
  kind: "counterDecrement",
  slot,
});

export type CaptureEffect =
  | { readonly kind: "captureReset" }
  | { readonly kind: "captureAppend"; readonly skip: 0 | 1 }
  | { readonly kind: "captureMark"; readonly flags: 1 };

export const captureReset = (): CaptureEffect => ({ kind: "captureReset" });
export const captureAppend = (skip: 0 | 1 = 0): CaptureEffect => ({ kind: "captureAppend", skip });
export const captureMark = (flags: 1): CaptureEffect => ({ kind: "captureMark", flags });

export type QueueEffect =
  | { readonly kind: "queueEnter" }
  | { readonly kind: "queueLeave" }
  | { readonly kind: "queueSave"; readonly footerIndent: FooterIndent }
  | { readonly kind: "queueShift" }
  | { readonly kind: "queueOpen" };

export const queueEnter = (): QueueEffect => ({ kind: "queueEnter" });
export const queueLeave = (): QueueEffect => ({ kind: "queueLeave" });
export const queueSave = (options: { readonly footerIndent?: FooterIndent } = {}): QueueEffect => ({
  kind: "queueSave",
  footerIndent: options.footerIndent ?? "none",
});
export const queueShift = (): QueueEffect => ({ kind: "queueShift" });
export const queueOpen = (): QueueEffect => ({ kind: "queueOpen" });

export type Effect =
  | RecordEffect
  | StateEffect
  | SpeculationEffect
  | WordEffect
  | InjectionEffect
  | RangeEffect
  | CaptureRun
  | CaptureColumn
  | CounterEffect
  | CaptureEffect
  | QueueEffect;
