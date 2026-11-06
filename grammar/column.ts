import type { ColumnSlot } from "./slot.ts";

/** A frame-local column inherited on push and restored on pop. */
export type CaptureColumn = { readonly kind: "captureColumn"; readonly slot: ColumnSlot };
export type ToColumn = {
  readonly kind: "toColumn";
  readonly slot: ColumnSlot;
  readonly ancestor?: number;
};

export const saveColumn = (slot: ColumnSlot): CaptureColumn => ({ kind: "captureColumn", slot });
/** Match a frame's column; ancestor 1 addresses the immediate parent. */
export const indentTo = (slot: ColumnSlot, options: { ancestor?: number } = {}): ToColumn => {
  const { ancestor = 0 } = options;
  if (!Number.isSafeInteger(ancestor) || ancestor < 0 || ancestor > 0x7fffffff)
    throw new RangeError("Invalid ancestor depth");
  return ancestor ? { kind: "toColumn", slot, ancestor } : { kind: "toColumn", slot };
};
