import { styleIdLimit, validateStyleAttributes, type Manifest } from "#/abi/mod.ts";

/** Assign stable host IDs and retain the first module's tag for each name. */
export class Styles {
  readonly names: string[] = [];
  readonly tags: (string | undefined)[] = [];
  readonly attributes: (string | undefined)[] = [];
  private readonly ids = new Map<string, number>();
  private readonly registered = new Set<number>();

  id(name: string): number {
    const existing = this.ids.get(name);
    if (existing !== undefined) return existing;
    if (this.names.length >= styleIdLimit) throw new RangeError("Style ID limit exceeded");
    const id = this.names.length;
    this.names.push(name);
    this.tags.push(undefined);
    this.attributes.push(undefined);
    this.ids.set(name, id);
    return id;
  }

  map(styles: Manifest["styles"]): Uint16Array {
    validateStyleAttributes(styles);
    return Uint16Array.from(styles, ({ name, tag, attribute }) => {
      const id = this.id(name);
      if (!this.registered.has(id)) {
        this.tags[id] = tag;
        this.attributes[id] = attribute;
        this.registered.add(id);
      }
      return id;
    });
  }
}
