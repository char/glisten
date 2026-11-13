import type { Session } from "./composition.ts";
import { Execution } from "./execution.ts";
import type { Languages } from "./languages.ts";
import { renderModule } from "./render_module.ts";

const module = new WebAssembly.Module(renderModule);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RendererExports = {
  render(source: number, records: number, count: number, table: number, output: number): number;
  renderGroups(
    source: number,
    records: number,
    count: number,
    table: number,
    output: number,
    groups: number,
    groupsEnd: number,
    groupTable: number,
    stack: number,
  ): number;
};

type Tags = {
  open: Uint8Array;
  close: Uint8Array;
  prefix: Uint8Array;
  attribute: boolean;
};

type Candidate = { mark: number; region: { start: number; size: number } | undefined };

export class Rendering {
  private readonly exports: RendererExports;
  private tags: (Tags | undefined)[] = [];
  private revision = -1;
  private region: { start: number; size: number } | undefined;
  private table = 0;
  private groupTable = 0;
  private maxTag = 0;

  constructor(private readonly execution: Execution) {
    this.exports = new WebAssembly.Instance(module, { env: { memory: execution.memory } })
      .exports as unknown as RendererExports;
  }

  prepare(languages: Languages): Candidate | undefined {
    if (this.revision === languages.revision) return;

    const candidate = { mark: this.execution.persistentMark(), region: this.region };
    try {
      this.update(languages);
      return candidate;
    } catch (error) {
      this.rollback(candidate);
      throw error;
    }
  }

  rollback(candidate: Candidate | undefined): void {
    if (!candidate) return;
    this.execution.restorePersistent(candidate.mark);
    this.region = candidate.region;
    this.revision = -1;
  }

  private update(languages: Languages): void {
    const tags = languages.definitions.map((style) =>
      style?.tag
        ? {
            open: encoder.encode(`<g-${style.tag}>`),
            close: encoder.encode(`</g-${style.tag}>`),
            prefix: encoder.encode(
              `<g-${style.tag}${style.attribute === undefined ? "" : ` ${style.attribute}=\"`}`,
            ),
            attribute: style.attribute !== undefined,
          }
        : undefined,
    );
    if (!tags.some((tag) => tag !== undefined)) {
      this.tags = tags;
      this.maxTag = 0;
      this.table = 0;
      this.groupTable = 0;
      this.revision = languages.revision;
      return;
    }
    let assetSize = 0;
    let maxTag = 0;
    for (const tag of tags) {
      if (!tag) continue;

      assetSize +=
        (tag.open.length > 8 ? tag.open.length : 0) +
        (tag.close.length > 8 ? tag.close.length : 0) +
        tag.prefix.length;
      maxTag = Math.max(maxTag, tag.open.length + tag.close.length);
    }

    const region = this.execution.reservePersistent(tags.length * 48 + assetSize, this.region);
    const table = region.start;
    const groupTable = table + tags.length * 32;
    this.writeTables(tags, table, groupTable);

    this.tags = tags;
    this.maxTag = maxTag;
    this.table = table;
    this.groupTable = groupTable;
    this.region = region;
    this.revision = languages.revision;
  }

  private writeTables(
    tags: readonly (Tags | undefined)[],
    table: number,
    groupTable: number,
  ): void {
    let cursor = groupTable + tags.length * 16;
    const bytes = new Uint8Array(this.execution.memory.buffer);
    const view = new DataView(this.execution.memory.buffer);
    bytes.fill(0, table, cursor);

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (!tag) continue;

      const entry = table + i * 32;
      view.setUint32(entry + 16, tag.open.length, true);
      view.setUint32(entry + 20, tag.close.length, true);
      if (tag.open.length <= 8) {
        bytes.set(tag.open, entry);
      } else {
        bytes.set(tag.open, cursor);
        view.setUint32(entry + 24, cursor, true);
        cursor += tag.open.length;
      }
      if (tag.close.length <= 8) {
        bytes.set(tag.close, entry + 8);
      } else {
        bytes.set(tag.close, cursor);
        view.setUint32(entry + 28, cursor, true);
        cursor += tag.close.length;
      }
      bytes.set(tag.prefix, cursor);
      view.setUint32(groupTable + i * 16, cursor, true);
      view.setUint32(groupTable + i * 16 + 4, tag.prefix.length, true);
      view.setUint32(groupTable + i * 16 + 8, Number(tag.attribute), true);
      cursor += tag.prefix.length;
    }
  }

  render(result: Session): string {
    if (!result.length) return "";

    const groups = result.groups;
    if (groups?.length) return this.renderGrouped(result, groups);

    const count = result.spans.count;
    const output = this.execution.allocate(result.length * 5 + count * this.maxTag + 16, 16);
    const buffer = this.execution.memory.buffer;
    const length = this.exports.render(
      result.input,
      result.spans.offset,
      count,
      this.table,
      output,
    );
    return decoder.decode(new Uint8Array(buffer, output, length));
  }

  private renderGrouped(result: Session, groups: Uint32Array): string {
    const count = result.spans.count;
    const input = result.input;
    const records = result.spans.offset;
    const active: number[] = [];
    const encodedValues: (Uint8Array | undefined)[] = [];
    let valueBytes = 0;
    let groupOutput = 0;
    for (let i = 0; i < groups.length / 3; i++) {
      const tag = this.tags[groups[i * 3 + 2]!];
      if (!tag) continue;

      active.push(i);
      const value = result.values?.[i];
      const encoded = value === undefined ? undefined : encoder.encode(value);
      encodedValues[i] = encoded;
      if (encoded) valueBytes += encoded.length;
      const length = encoded?.length ?? groups[i * 3 + 1]! - groups[i * 3]!;
      groupOutput += tag.prefix.length + tag.close.length + 2 + (tag.attribute ? length * 6 : 0);
    }

    const groupRecords = this.execution.allocate(active.length * 20, 4);
    const stack = this.execution.allocate(active.length * 4, 4);
    const data = this.execution.allocate(valueBytes, 1);
    const outputSize =
      result.length * 5 + (count + active.length * 2) * this.maxTag + groupOutput + 16;
    const output = this.execution.allocate(outputSize, 16);
    const buffer = this.execution.memory.buffer;
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let cursor = data;
    for (let j = 0; j < active.length; j++) {
      const i = active[j]!;
      const start = groups[i * 3]!;
      const end = groups[i * 3 + 1]!;
      const value = encodedValues[i];
      const at = groupRecords + j * 20;
      view.setUint32(at, start, true);
      view.setUint32(at + 4, end, true);
      view.setUint32(at + 8, groups[i * 3 + 2]!, true);
      view.setUint32(at + 12, value ? cursor : input + start, true);
      view.setUint32(at + 16, value ? value.length : end - start, true);
      if (!value) continue;

      bytes.set(value, cursor);
      cursor += value.length;
    }

    const length = active.length
      ? this.exports.renderGroups(
          input,
          records,
          count,
          this.table,
          output,
          groupRecords,
          groupRecords + active.length * 20,
          this.groupTable,
          stack,
        )
      : this.exports.render(input, records, count, this.table, output);
    return decoder.decode(new Uint8Array(buffer, output, length));
  }
}
