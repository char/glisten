import { AbiError } from "#/abi/mod.ts";
import { compose, type Result } from "./compose.ts";
import { Engine, type CallContext } from "./engine.ts";
import { Arena, defaultMemoryLimitBytes, ResourceError } from "./memory.ts";
import { Names } from "./names.ts";
import { Scratch } from "./planning.ts";
import { Renderer } from "./render.ts";
import { Styles } from "./styles.ts";

export { AbiError, Engine, ResourceError };
export { composeWith, type Result } from "./compose.ts";
export type { Callee, CallContext, CallResult } from "./engine.ts";

/** Shared-memory highlighter and language registry. */
export class Highlighter {
  private readonly arena: Arena;
  private readonly names = new Names<Engine>();
  private readonly scratch = new Scratch();
  private readonly registry = new Styles();
  private readonly renderer: Renderer;
  private readonly engines: Engine[] = [];
  private readonly missingStyle: number;
  private readonly checks: boolean;
  private disposed = false;

  constructor(
    options: { memoryLimitBytes?: number; missingStyle?: string; checks?: boolean } = {},
  ) {
    this.arena = new Arena(options.memoryLimitBytes ?? defaultMemoryLimitBytes);
    this.renderer = new Renderer(this.arena);
    this.missingStyle = this.registry.id(options.missingStyle ?? "plain");
    this.checks = options.checks ?? false;
  }

  /** Canonical language names in registration order. */
  get languages(): readonly string[] {
    return this.engines.map((engine) => engine.manifest.language);
  }

  /** Registered style names; span style IDs index this array. */
  get styles(): readonly string[] {
    return this.registry.names;
  }

  /** Instantiate a module and register its names and styles. */
  async add(module: WebAssembly.Module): Promise<void> {
    if (this.disposed) throw new Error("Highlighter is disposed");
    const engine = await Engine.create(module, { arena: this.arena });
    engine.useStyles(this.registry.map(engine.manifest.styles));
    this.renderer.sync(this.registry.tags, this.registry.attributes);
    this.engines.push(engine);
    this.names.add([engine.manifest.language, ...engine.manifest.aliases], engine);
  }

  /** Render a whole UTF-8 document as HTML; throws ResourceError on resource failure. */
  highlight(language: string, source: string | Uint8Array): string {
    if (this.disposed) throw new Error("Highlighter is disposed");
    const context = this.arena.place(source);
    const result = this.process(language, context, false);
    if (result.status === "resource") throw new ResourceError();
    return this.renderer.render(context, result.spans, result.groups, result.values);
  }

  /** Lower-level byte-span result; span ends are UTF-8 byte offsets. */
  _process(language: string, source: string | Uint8Array): Result {
    if (this.disposed) throw new Error("Highlighter is disposed");
    try {
      return this.process(language, this.arena.place(source));
    } catch (error) {
      if (error instanceof ResourceError) return { status: "resource" };
      throw error;
    }
  }

  private process(language: string, context: CallContext, copySpans = true): Result {
    return compose(language, context, {
      names: this.names,
      missingStyle: this.missingStyle,
      checks: this.checks,
      scratch: this.scratch,
      copySpans,
    });
  }

  /** Mark this host unusable; its memory is released when it becomes unreachable. */
  dispose(): void {
    this.disposed = true;
  }
}
