import type { CallContext } from "./engine.ts";
import { Arena, ResourceError } from "./memory.ts";
import { renderModule } from "./render_module.ts";

const compiled = new WebAssembly.Module(renderModule);

// These layouts are shared with render.wat.
const styleEntryBytes = 32;
const groupStyleEntryBytes = 16;
const groupEntryBytes = 20;
const inlineTagBytes = 8;

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
  /** Per style: byte length of `<g-TAG`, including ` NAME="` when attributed. */
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
      let table = this.arena.allocateArea(capacity * styleEntryBytes);
      // Address zero means "no table" to the renderer.
      if (table === 0) table = this.arena.allocateArea(capacity * styleEntryBytes);
      const groupTable = this.arena.allocateArea(capacity * groupStyleEntryBytes);
      const bytes = new Uint8Array(this.arena.buffer);
      bytes.fill(0, table, table + capacity * styleEntryBytes);
      bytes.fill(0, groupTable, groupTable + capacity * groupStyleEntryBytes);
      if (this.table) {
        bytes.copyWithin(table, this.table, this.table + this.capacity * styleEntryBytes);
        bytes.copyWithin(
          groupTable,
          this.groupTable,
          this.groupTable + this.capacity * groupStyleEntryBytes,
        );
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
      if (open.length > inlineTagBytes) {
        openPointer = this.arena.allocateArea(open.length);
        new Uint8Array(this.arena.buffer, openPointer, open.length).set(open);
      }
      if (close.length > inlineTagBytes) {
        closePointer = this.arena.allocateArea(close.length);
        new Uint8Array(this.arena.buffer, closePointer, close.length).set(close);
      }
      const entry = this.table + id * styleEntryBytes;
      const bytes = new Uint8Array(this.arena.buffer);
      if (open.length <= inlineTagBytes) bytes.set(open, entry);
      if (close.length <= inlineTagBytes) bytes.set(close, entry + inlineTagBytes);
      const view = new DataView(this.arena.buffer);
      view.setUint32(entry + 16, open.length, true);
      view.setUint32(entry + 20, close.length, true);
      view.setUint32(entry + 24, openPointer, true);
      view.setUint32(entry + 28, closePointer, true);
      const attribute = attributes[id];
      const prefix = this.encoder.encode(
        attribute === undefined ? `<g-${tag}` : `<g-${tag} ${attribute}="`,
      );
      const prefixPointer = this.arena.allocateArea(prefix.length);
      new Uint8Array(this.arena.buffer, prefixPointer, prefix.length).set(prefix);
      new Uint32Array(this.arena.buffer, this.groupTable + id * groupStyleEntryBytes, 3).set([
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
    const inArena = spans.buffer === this.arena.buffer;
    let records = spans.byteOffset;
    if (!inArena) {
      records = this.arena.allocate(bytes);
      new Uint32Array(this.arena.buffer, records, spans.length).set(spans);
    }
    // Inline tag stores can write up to seven bytes beyond the logical end.
    let bound = length * 5 + count * this.maxTagBytes + inlineTagBytes;
    let layout = 0;
    let visible = 0;
    if (groups?.length) {
      const encoded = values?.map((value) =>
        value === undefined ? undefined : this.encoder.encode(value),
      );
      layout = this.arena.allocate((groups.length / 3) * groupEntryBytes);
      for (let i = 0; i < groups.length; i += 3) {
        const style = groups[i + 2]!;
        const prefix = this.prefixes[style];
        if (prefix === undefined) continue;
        const value = encoded?.[i / 3];
        let pointer = input + groups[i]!;
        if (value) {
          pointer = this.arena.allocate(value.length, 1);
          new Uint8Array(this.arena.buffer, pointer, value.length).set(value);
        }
        const valueLength = value?.length ?? groups[i + 1]! - groups[i]!;
        const words = new Uint32Array(this.arena.buffer, layout + visible * groupEntryBytes, 5);
        words[0] = groups[i]!;
        words[1] = groups[i + 1]!;
        words[2] = style;
        words[3] = pointer;
        words[4] = valueLength;
        visible++;
        // The group's tags, its escaped value, and one span element split at each boundary.
        bound += prefix + 2 + valueLength * 6 + this.maxTagBytes * 3;
      }
    }
    if (bound > 0xffff_ffff) throw new ResourceError("Rendered output is too large");
    const stack = visible ? this.arena.allocate(visible * 4) : 0;
    const output = this.arena.allocate(bound);
    const written = visible
      ? this.renderGroupsWasm(
          input,
          records,
          count,
          this.table,
          output,
          layout,
          layout + visible * groupEntryBytes,
          this.groupTable,
          stack,
        )
      : this.renderWasm(input, records, count, this.table, output);
    return this.decoder.decode(new Uint8Array(this.arena.buffer, output, written));
  }
}
