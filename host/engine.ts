import { record, readManifest, status, type Exports, type Manifest } from "#/abi/mod.ts";
import { Arena, defaultMemoryLimitBytes, ResourceError } from "./memory.ts";

/** Source bytes and, for WebAssembly engines, their one-time placement in shared memory. */
export type CallContext = {
  readonly source: () => Uint8Array;
  readonly placement?: { readonly input: number; readonly arena: Arena };
};

/** A successful call leaves a fresh-view accessor; a resource failure has no records. */
export type CallResult =
  | {
      status: "ok";
      records: () => Uint32Array;
      injections: number;
      groups?: number;
      groupValues?: ReadonlyMap<number, string>;
    }
  | { status: "resource" };

/** A module that can highlight a batch of documents, `[start, end]` each. */
export type Callee = {
  readonly manifest: Manifest;
  useStyles(map: Uint16Array): void;
  call(context: CallContext, documents: Uint32Array): CallResult;
};

/** One WebAssembly instance backed by a shared arena. */
export class Engine implements Callee {
  private constructor(
    readonly manifest: Manifest,
    private readonly arena: Arena,
    readonly base: number,
    private readonly exports: Exports,
  ) {}

  /** Instantiate a module, optionally sharing the arena of other engines. */
  static async create(
    module: WebAssembly.Module,
    options: { arena?: Arena; memoryLimitBytes?: number } = {},
  ): Promise<Engine> {
    const manifest = readManifest(module);
    const arena = options.arena ?? new Arena(options.memoryLimitBytes ?? defaultMemoryLimitBytes);
    const base = arena.allocateArea(manifest.areaBytes);
    const instance = await WebAssembly.instantiate(module, {
      env: { memory: arena.memory, base: new WebAssembly.Global({ value: "i32" }, base) },
    });
    return new Engine(manifest, arena, base, instance.exports as unknown as Exports);
  }

  /** Install the module-style to host-style mapping in the module's area. */
  useStyles(map: Uint16Array): void {
    new Uint16Array(this.arena.buffer, this.base + this.manifest.styleMap, map.length).set(map);
  }

  /** Invoke the module with documents in shared memory and preserve its record area. */
  call(context: CallContext, documents: Uint32Array): CallResult {
    const placement = context.placement;
    const arena = this.arena;
    if (!placement || placement.arena !== arena)
      throw new Error("Engine requires its shared arena and prepared input");
    const source = context.source();
    if (documents.length === 2 && documents[0] === documents[1] && documents[0]! <= source.length) {
      const records = new Uint32Array();
      return { status: "ok", records: () => records, injections: 0, groups: 0 };
    }
    let documentAddress: number;
    let outputAddress: number;
    try {
      documentAddress = arena.allocate(documents.byteLength);
      new Uint32Array(arena.buffer, documentAddress, documents.length).set(documents);
      outputAddress = arena.outputStart();
      arena.ensure(outputAddress);
    } catch (error) {
      if (error instanceof ResourceError) return { status: "resource" };
      throw error;
    }

    let code: number;
    try {
      code = this.exports.highlight(
        placement.input,
        source.length,
        documentAddress,
        documents.length / 2,
        outputAddress,
      );
    } catch (error) {
      if (
        !(error instanceof WebAssembly.RuntimeError) ||
        this.exports.status.value !== status.resource
      )
        throw error;
      code = status.resource;
    } finally {
      arena.refresh();
    }
    if (code === status.resource) return { status: "resource" };
    if (code !== status.ok) throw new Error(`Unknown module status ${code}`);
    const recordCount = Number(this.exports.records.value) >>> 0;
    try {
      if (this.exports.scratchRequired) arena.ensure(Number(this.exports.scratchRequired.value));
      arena.commitOutput(outputAddress + recordCount * record.bytes);
    } catch (error) {
      if (error instanceof ResourceError) return { status: "resource" };
      throw error;
    }
    let view: Uint32Array | undefined;
    return {
      status: "ok",
      injections: Number(this.exports.injections.value) >>> 0,
      groups: this.exports.groups ? Number(this.exports.groups.value) >>> 0 : 0,
      records: () => {
        if (view === undefined || view.buffer !== arena.buffer)
          view = new Uint32Array(arena.buffer, outputAddress, recordCount * 2);
        return view;
      },
    };
  }
}
