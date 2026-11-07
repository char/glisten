import { raw, wat, type Fragment, type Part } from "./template.ts";

type Field = "i32" | "i64";

/** A fixed memory layout whose fields lie in declaration order, each at its natural alignment. */
export type Struct<Fields extends Record<string, Field>> = {
  /** The record size, padded to the widest field's alignment. */
  readonly size: number;
  /** Byte offset of each field. */
  readonly offset: { readonly [Name in keyof Fields]: number };
  /** Load a field of the record at `address`. */
  get(address: Part, field: keyof Fields & string): Fragment;
  /** Store `value` into a field of the record at `address`. */
  set(address: Part, field: keyof Fields & string, value: Part): Fragment;
  /** The address of record `index` in an array starting at `base`. */
  at(base: Part, index: Part): Fragment;
};

export function struct<const Fields extends Record<string, Field>>(fields: Fields): Struct<Fields> {
  const offset: Record<string, number> = {};
  let end = 0;
  let alignment = 4;
  for (const [name, type] of Object.entries(fields)) {
    const width = type === "i64" ? 8 : 4;
    end = Math.ceil(end / width) * width;
    offset[name] = end;
    end += width;
    alignment = Math.max(alignment, width);
  }
  const size = Math.ceil(end / alignment) * alignment;
  const shift = Number.isInteger(Math.log2(size)) ? Math.log2(size) : undefined;
  const access = (field: string, operation: "load" | "store") => {
    const at = offset[field];
    if (at === undefined) throw new Error(`Unknown field ${field}`);
    return raw(`${fields[field]}.${operation}${at ? ` offset=${at}` : ""}`);
  };
  return {
    size,
    offset: offset as Struct<Fields>["offset"],
    get: (address, field) => wat`(${access(field, "load")} ${address})`,
    set: (address, field, value) => wat`(${access(field, "store")} ${address} ${value})`,
    at: (base, index) =>
      shift === undefined
        ? wat`(i32.add ${base} (i32.mul ${index} (i32.const ${size})))`
        : wat`(i32.add ${base} (i32.shl ${index} (i32.const ${shift})))`,
  };
}
