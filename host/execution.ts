import { checkRecords, type Exports, type Manifest } from "#/abi/mod.ts";

const pageBytes = 65536;
const align = (value: number, alignment: number) => Math.ceil(value / alignment) * alignment;
const encoder = new TextEncoder();

export class ResourceError extends Error {
  constructor(message = "Guest memory or execution resources exhausted") {
    super(message);
    this.name = "ResourceError";
  }
}

export type Guest = {
  manifest: Manifest;
  exports: Exports;
};

export type Call = {
  offset: number;
  count: number;
  injections: number;
  groups: number;
};

export class Execution {
  readonly memory: WebAssembly.Memory;
  private areasEnd = 0;
  private cursor = 0;

  constructor(
    readonly limit: number,
    private readonly checks: boolean,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 0x1_0000_0000)
      throw new RangeError("Invalid guest memory limit");
    this.memory = new WebAssembly.Memory({
      initial: 1,
      maximum: Math.max(1, Math.ceil(limit / pageBytes)),
    });
  }

  ensure(end: number): void {
    if (!Number.isSafeInteger(end) || end < 0 || end > this.limit) throw new ResourceError();

    const pages = Math.ceil((end - this.memory.buffer.byteLength) / pageBytes);
    if (pages > 0) {
      try {
        this.memory.grow(pages);
      } catch (error) {
        if (error instanceof RangeError) throw new ResourceError();
        throw error;
      }
    }
  }

  instantiate(module: WebAssembly.Module, manifest: Manifest, styles: Uint16Array): Guest {
    const base = align(this.areasEnd, 16);
    const end = base + manifest.areaBytes;
    if (
      !Number.isSafeInteger(manifest.areaBytes) ||
      manifest.areaBytes < 0 ||
      manifest.areaBytes % 16 !== 0 ||
      !Number.isSafeInteger(manifest.styleMap) ||
      manifest.styleMap < 0 ||
      manifest.styleMap + styles.byteLength > manifest.areaBytes
    )
      throw new Error("Invalid module area");

    this.ensure(end);
    const instance = new WebAssembly.Instance(module, { env: { memory: this.memory, base } });
    const view = new DataView(this.memory.buffer);
    for (let i = 0; i < styles.length; i++)
      view.setUint16(base + manifest.styleMap + i * 2, styles[i]!, true);
    this.areasEnd = end;
    return { manifest, exports: instance.exports as unknown as Exports };
  }

  persistentMark(): number {
    return this.areasEnd;
  }

  restorePersistent(mark: number): void {
    this.areasEnd = mark;
    this.cursor = mark;
  }

  reservePersistent(
    bytes: number,
    previous?: { start: number; size: number },
  ): { start: number; size: number } {
    if (previous && previous.size >= bytes) return previous;
    const reusable = previous && previous.start + previous.size === this.areasEnd;
    const start = reusable ? previous.start : align(this.areasEnd, 16);
    const capacity = 2 ** Math.ceil(Math.log2(Math.max(128, bytes)));
    const size = start + capacity <= this.limit ? capacity : bytes;
    this.ensure(start + size);
    this.areasEnd = start + size;
    return { start, size };
  }

  begin(): void {
    this.cursor = align(this.areasEnd, 16);
  }

  prepare(source: string | Uint8Array): { input: number; length: number } {
    if (!source.length) return { input: 0, length: 0 };
    if (typeof source !== "string") {
      const input = this.allocate(source.length + 16, 16);
      new Uint8Array(this.memory.buffer, input, source.length).set(source);
      return { input, length: source.length };
    }

    const input = align(this.cursor, 16);
    const capacity = Math.min(source.length * 3, this.limit - input - 16);
    if (capacity < 0) throw new ResourceError();
    this.ensure(input + capacity + 16);
    const encoded = encoder.encodeInto(source, new Uint8Array(this.memory.buffer, input, capacity));
    if (encoded.read !== source.length) throw new ResourceError();
    this.cursor = input + encoded.written + 16;
    return { input, length: encoded.written };
  }

  allocate(bytes: number, alignment = 4): number {
    const start = align(this.cursor, alignment);
    const end = start + bytes;
    this.ensure(end);
    this.cursor = end;
    return start;
  }

  call(guest: Guest, input: number, length: number, documents: number, count: number): Call {
    const output = align(this.cursor, 4);
    this.ensure(output);
    const exports = guest.exports;
    let code: number;
    try {
      code = exports.highlight(input, length, documents, count, output);
    } catch (error) {
      if (error instanceof WebAssembly.RuntimeError && Number(exports.status.value) === 1)
        throw new ResourceError();
      throw error;
    }
    if (code === 1) throw new ResourceError();
    if (code !== 0) throw new Error(`Unknown guest status ${code}`);

    const records = Number(exports.records.value) >>> 0;
    const injections = Number(exports.injections.value) >>> 0;
    const groups = exports.groups ? Number(exports.groups.value) >>> 0 : 0;
    const end = output + records * 8;
    this.ensure(end);
    if (exports.scratchRequired && BigInt(exports.scratchRequired.value) > BigInt(this.limit))
      throw new ResourceError();
    this.cursor = end;
    if (this.checks)
      checkRecords(
        new Uint32Array(this.memory.buffer, output, records * 2),
        new Uint32Array(this.memory.buffer, documents, count * 2),
        injections,
      );

    return { offset: output, count: records, injections, groups };
  }

  words(call: Call): Uint32Array {
    return new Uint32Array(this.memory.buffer, call.offset, call.count * 2);
  }
}
