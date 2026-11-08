import { memory } from "#/abi/mod.ts";
import type { CallContext } from "./engine.ts";
import type { SourceRange } from "./documents.ts";

/** Default maximum size of the host's shared memory. */
export const defaultMemoryLimitBytes = 64 * 1024 * 1024;

/** Resource exhaustion. */
export class ResourceError extends Error {
  constructor(message = "Resource limit exceeded") {
    super(message);
    this.name = "ResourceError";
  }
}

/** Shared module areas and temporary allocations for one highlight call tree. */
export class Arena {
  /** Memory shared by all module instances attached to this arena. */
  readonly memory: WebAssembly.Memory;
  private areasEnd = 0;
  private cursor = 0;
  private capacity: number = memory.pageBytes;
  private readonly encoder = new TextEncoder();
  /** The backing store of {@link memory}; re-read after a module call that may grow it. */
  buffer: ArrayBuffer;

  /** Create an arena with an exact logical byte limit and page-rounded backing memory. */
  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new RangeError("memoryLimitBytes must be a non-negative safe integer");
    // WebAssembly pages are indivisible; allocations still obey the exact byte limit.
    this.memory = new WebAssembly.Memory({
      initial: 1,
      maximum: Math.max(1, Math.ceil(limit / memory.pageBytes)),
    });
    this.buffer = this.memory.buffer;
  }

  /** Take the backing store again after a module call that may have grown memory. */
  refresh(): void {
    this.buffer = this.memory.buffer;
    this.capacity = this.buffer.byteLength;
  }

  /** Ensure bytes below the exclusive end are available and within the configured limit. */
  ensure(end: number): void {
    if (!Number.isSafeInteger(end) || end > this.limit || end < 0)
      throw new ResourceError("Memory limit exceeded");
    if (end <= this.capacity) return;
    const pages = Math.ceil(end / memory.pageBytes);
    try {
      this.memory.grow(pages - this.capacity / memory.pageBytes);
    } catch {
      throw new ResourceError("Memory limit exceeded");
    }
    this.refresh();
  }

  /** Reserve a permanent, aligned module area; call only outside a highlight. */
  allocateArea(bytes: number): number {
    this.cursor = this.areasEnd;
    const base = this.allocate(bytes, memory.align);
    this.areasEnd = this.cursor;
    return base;
  }

  /** Place input and padding once, returning views that survive until the next growth. */
  place(source: string | Uint8Array): CallContext {
    this.begin();
    if (!source.length) {
      const empty = new Uint8Array();
      return { source: () => empty, placement: { input: 0, arena: this } };
    }
    const input = Math.ceil(this.cursor / memory.align) * memory.align;
    const available = this.limit - input - memory.padding;
    if (available < 0) throw new ResourceError("Memory limit exceeded");
    const capacity =
      typeof source === "string" ? Math.min(source.length * 3, available) : source.length;
    if (capacity > available) throw new ResourceError("Memory limit exceeded");
    this.ensure(input + capacity + memory.padding);
    const destination = new Uint8Array(this.buffer, input, capacity);
    let length: number;
    if (typeof source === "string") {
      const encoded = this.encoder.encodeInto(source, destination);
      if (encoded.read < source.length) throw new ResourceError("Memory limit exceeded");
      length = encoded.written;
    } else {
      destination.set(source);
      length = source.length;
    }
    const end = input + length;
    new Uint8Array(this.buffer, end, memory.padding).fill(0);
    this.cursor = end + memory.padding;
    let view: Uint8Array | undefined;
    return {
      source: () =>
        view === undefined || view.buffer !== this.buffer
          ? (view = new Uint8Array(this.buffer, input, length))
          : view,
      placement: { input, arena: this },
    };
  }

  /** Place a joined document after existing call data, preserving single pieces in place. */
  join(
    context: CallContext,
    pieces: readonly SourceRange[],
  ): { context: CallContext; range: SourceRange } {
    const placement = context.placement;
    if (!placement || placement.arena !== this)
      throw new Error("Document joining requires its shared arena and prepared input");
    const length = context.source().length;
    if (!pieces.length) throw new RangeError("A document must contain at least one piece");
    let size = 0;
    let previousEnd = 0;
    for (const { start, end } of pieces) {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < previousEnd ||
        end <= start ||
        end > length
      )
        throw new RangeError("Invalid document pieces");
      size += end - start;
      if (!Number.isSafeInteger(size)) throw new RangeError("Document is too long");
      previousEnd = end;
    }
    if (pieces.length === 1) return { context, range: pieces[0]! };
    const address = this.allocate(size + memory.padding, 1);
    const source = context.source();
    const destination = new Uint8Array(this.buffer, address, size + memory.padding);
    let at = 0;
    for (const { start, end } of pieces) {
      destination.set(source.subarray(start, end), at);
      at += end - start;
    }
    destination.fill(0, size);
    const start = address - placement.input;
    const end = start + size;
    return {
      context: {
        source: () => new Uint8Array(this.buffer, placement.input, end),
        placement,
      },
      range: { start, end },
    };
  }

  /** Discard temporary allocations from the previous highlight. */
  begin(): void {
    this.cursor = this.areasEnd;
  }

  /** Reserve an aligned temporary range and return its byte offset. */
  allocate(bytes: number, alignment = 4): number {
    const start = Math.ceil(this.cursor / alignment) * alignment;
    const end = start + bytes;
    this.ensure(end);
    this.cursor = end;
    return start;
  }

  /** Return the aligned address where a module can begin writing its records. */
  outputStart(): number {
    return Math.ceil(this.cursor / 4) * 4;
  }

  /** Preserve records through their exclusive end for the remainder of this call tree. */
  commitOutput(end: number): void {
    this.ensure(end);
    this.cursor = end;
  }
}
