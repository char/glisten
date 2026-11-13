import { layout, type Field, type Layout } from "#/abi/mod.ts";
import { raw, wat, type Fragment, type Part } from "./template.ts";

/** A naturally aligned layout with WAT accessors for its string-named fields. */
export type Struct<Fields extends Record<PropertyKey, Field>> = Layout<Fields> & {
  /** Load a field of the record at `address`. */
  get(address: Part, field: keyof Fields & string): Fragment;
  /** Store `value` into a field of the record at `address`. */
  set(address: Part, field: keyof Fields & string, value: Part): Fragment;
  /** The address of record `index` in an array starting at `base`. */
  at(base: Part, index: Part): Fragment;
};

export function struct<const Fields extends Record<PropertyKey, Field>>(
  fields: Fields,
): Struct<Fields> {
  const { size, offset } = layout(fields);
  const shift = Number.isInteger(Math.log2(size)) ? Math.log2(size) : undefined;
  const access = (field: keyof Fields & string, operation: "load" | "store") => {
    const at = offset[field];
    if (at === undefined) throw new Error(`Unknown field ${field}`);
    return raw(`${fields[field]}.${operation}${at ? ` offset=${at}` : ""}`);
  };
  return {
    size,
    offset,
    get: (address, field) => wat`(${access(field, "load")} ${address})`,
    set: (address, field, value) => wat`(${access(field, "store")} ${address} ${value})`,
    at: (base, index) =>
      shift === undefined
        ? wat`(i32.add ${base} (i32.mul ${index} (i32.const ${size})))`
        : wat`(i32.add ${base} (i32.shl ${index} (i32.const ${shift})))`,
  };
}
