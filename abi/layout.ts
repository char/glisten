export type Field = "i32" | "i64";

export type Layout<Fields extends Record<PropertyKey, Field>> = {
  readonly size: number;
  readonly offset: { readonly [Key in keyof Fields]: number };
};

export function layout<const Fields extends Record<PropertyKey, Field>>(
  fields: Fields,
): Layout<Fields> {
  const offset = Object.create(null) as { -readonly [Key in keyof Fields]: number };
  let end = 0;
  let alignment = 1;

  for (const key of Reflect.ownKeys(fields) as (keyof Fields)[]) {
    const width = fields[key] === "i64" ? 8 : 4;
    end = Math.ceil(end / width) * width;
    Object.defineProperty(offset, key, { value: end, enumerable: true });
    end += width;
    alignment = Math.max(alignment, width);
  }

  return { size: Math.ceil(end / alignment) * alignment, offset };
}
