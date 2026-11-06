import type { CallContext } from "./engine.ts";
import { Arena, ResourceError } from "./memory.ts";
import { renderModule } from "./render_module.ts";

const compiled = new WebAssembly.Module(renderModule);

/** Renderer tables live in permanent arena areas; output and composed records are temporary. */
export class Renderer {
  private readonly renderWasm: (
    source: number,
    records: number,
    count: number,
    table: number,
    output: number,
  ) => number;
  private readonly renderGroupsWasm: (
    source: number,
    records: number,
    count: number,
    table: number,
    output: number,
    groups: number,
    groupsEnd: number,
    groupTable: number,
    stack: number,
  ) => number;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly installed: (string | undefined)[] = [];
  /** Per style: the group open prefix (`<g-TAG` plus ` NAME="` with an attribute) and its length. */
  private readonly prefixes: number[] = [];
  private table = 0;
  private groupTable = 0;
  private capacity = 0;
  private maxTagBytes = 0;

  constructor(private readonly arena: Arena) {
    const instance = new WebAssembly.Instance(compiled, { env: { memory: arena.memory } });
    this.renderWasm = instance.exports.render as typeof this.renderWasm;
    this.renderGroupsWasm = instance.exports.renderGroups as typeof this.renderGroupsWasm;
  }

  /** Install the first registered tag for each style, retaining arbitrary manifest tag lengths. */
  sync(tags: readonly (string | undefined)[], attributes: readonly (string | undefined)[]): void {
    if (!this.table && !tags.some((tag) => tag !== undefined)) return;
    if (tags.length > this.capacity) {
      const capacity = Math.max(tags.length, this.capacity * 2, 8);
      let table = this.arena.allocateArea(capacity * 32);
      if (table === 0) table = this.arena.allocateArea(capacity * 32);
      const groupTable = this.arena.allocateArea(capacity * 16);
      const bytes = new Uint8Array(this.arena.memory.buffer);
      bytes.fill(0, table, table + capacity * 32);
      bytes.fill(0, groupTable, groupTable + capacity * 16);
      if (this.table) {
        bytes.copyWithin(table, this.table, this.table + this.capacity * 32);
        bytes.copyWithin(groupTable, this.groupTable, this.groupTable + this.capacity * 16);
      }
      this.table = table;
      this.groupTable = groupTable;
      this.capacity = capacity;
    }
    for (let id = 0; id < tags.length; id++) {
      const tag = tags[id];
      if (tag === undefined || this.installed[id] === tag) continue;
      const open = this.encoder.encode(`<g-${tag}>`);
      const close = this.encoder.encode(`</g-${tag}>`);
      let openPointer = 0;
      let closePointer = 0;
      if (open.length > 8) {
        openPointer = this.arena.allocateArea(open.length);
        new Uint8Array(this.arena.memory.buffer, openPointer, open.length).set(open);
      }
      if (close.length > 8) {
        closePointer = this.arena.allocateArea(close.length);
        new Uint8Array(this.arena.memory.buffer, closePointer, close.length).set(close);
      }
      const entry = this.table + id * 32;
      const bytes = new Uint8Array(this.arena.memory.buffer);
      if (open.length <= 8) bytes.set(open, entry);
      if (close.length <= 8) bytes.set(close, entry + 8);
      const view = new DataView(this.arena.memory.buffer);
      view.setUint32(entry + 16, open.length, true);
      view.setUint32(entry + 20, close.length, true);
      view.setUint32(entry + 24, openPointer, true);
      view.setUint32(entry + 28, closePointer, true);
      const attribute = attributes[id];
      const prefix = this.encoder.encode(
        attribute === undefined ? `<g-${tag}` : `<g-${tag} ${attribute}="`,
      );
      const prefixPointer = this.arena.allocateArea(prefix.length);
      new Uint8Array(this.arena.memory.buffer, prefixPointer, prefix.length).set(prefix);
      new Uint32Array(this.arena.memory.buffer, this.groupTable + id * 16, 3).set([
        prefixPointer,
        prefix.length,
        attribute === undefined ? 0 : 1,
      ]);
      this.prefixes[id] = prefix.length;
      this.installed[id] = tag;
      this.maxTagBytes = Math.max(this.maxTagBytes, open.length + close.length);
    }
  }

  /**
   * Read direct module records when possible; only composed or synthetic spans need a copy.
   * `groups` are `[start, end, style]` triples ordered by start, outermost first; a defined
   * `values[i]` replaces group i's attribute value (a fragment's full logical text).
   */
  render(
    context: CallContext,
    spans: Uint32Array,
    groups?: Uint32Array,
    values?: readonly (string | undefined)[],
  ): string {
    const length = context.source().length;
    if (!length) return "";
    const input = context.placement!.input;
    const count = spans.length / 2;
    const bytes = spans.byteLength;
    const inArena = spans.buffer === this.arena.memory.buffer;
    let records = spans.byteOffset;
    if (!inArena) {
      records = this.arena.allocate(bytes);
      new Uint32Array(this.arena.memory.buffer, records, spans.length).set(spans);
    }
    // Inline tag stores can write up to seven bytes beyond the logical end.
    let bound = length * 5 + count * this.maxTagBytes + 8;
    let layout = 0;
    let visible = 0;
    if (groups?.length) {
      const encoded = values?.map((value) =>
        value === undefined ? undefined : this.encoder.encode(value),
      );
      layout = this.arena.allocate((groups.length / 3) * 20);
      for (let i = 0; i < groups.length; i += 3) {
        const style = groups[i + 2]!;
        const prefix = this.prefixes[style];
        if (prefix === undefined) continue;
        const value = encoded?.[i / 3];
        let pointer = input + groups[i]!;
        if (value) {
          pointer = this.arena.allocate(value.length, 1);
          new Uint8Array(this.arena.memory.buffer, pointer, value.length).set(value);
        }
        const valueLength = value?.length ?? groups[i + 1]! - groups[i]!;
        const words = new Uint32Array(this.arena.memory.buffer, layout + visible * 20, 5);
        words.set([groups[i]!, groups[i + 1]!, style, pointer, valueLength]);
        visible++;
        // The group's tags, its escaped value, and one span element split at each boundary.
        bound += prefix + 2 + valueLength * 6 + this.maxTagBytes * 3;
      }
    }
    if (bound > 0xffff_ffff) throw new ResourceError("Rendered output is too large");
    const stack = this.arena.allocate(visible * 4);
    const output = this.arena.allocate(bound);
    const written = visible
      ? this.renderGroupsWasm(
          input,
          records,
          count,
          this.table,
          output,
          layout,
          layout + visible * 20,
          this.groupTable,
          stack,
        )
      : this.renderWasm(input, records, count, this.table, output);
    return this.decoder.decode(new Uint8Array(this.arena.memory.buffer, output, written));
  }
}
