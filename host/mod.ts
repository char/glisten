import { AbiError, readManifest } from "#/abi/mod.ts";
import { compose, type ComposeOptions, type Result } from "./compose.ts";
import { Engine } from "./engine.ts";
import { Arena, defaultMemoryLimitBytes, ResourceError } from "./memory.ts";
import { asciiLower, Names } from "./names.ts";
import { Scratch } from "./planning.ts";
import { Renderer } from "./render.ts";
import { Styles } from "./styles.ts";

export { languageFor } from "#/filename.ts";
export { AbiError, Engine, ResourceError };
export { composeWith, type Result } from "./compose.ts";
export type { Callee, CallContext, CallResult } from "./engine.ts";

/** Resolve a language name or alias to a module; undefined leaves it unstyled. */
export type LanguageLoader = (name: string) => Promise<WebAssembly.Module | undefined>;

/** Shared-memory highlighter and language registry. */
export class Highlighter {
  private readonly arena: Arena;
  private readonly names = new Names<Engine>();
  private readonly scratch = new Scratch();
  private readonly registry = new Styles();
  private readonly renderer: Renderer;
  private readonly engines: Engine[] = [];
  private readonly missingStyle: number;
  private readonly copying: ComposeOptions;
  private readonly borrowing: ComposeOptions;
  private readonly checks: boolean;
  private readonly loadLanguage: LanguageLoader | undefined;
  private readonly loading = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(
    options: {
      memoryLimitBytes?: number;
      missingStyle?: string;
      checks?: boolean;
      loadLanguage?: LanguageLoader;
    } = {},
  ) {
    this.arena = new Arena(options.memoryLimitBytes ?? defaultMemoryLimitBytes);
    this.renderer = new Renderer(this.arena);
    this.missingStyle = this.registry.id(options.missingStyle ?? "plain");
    this.checks = options.checks ?? false;
    this.loadLanguage = options.loadLanguage;
    const shared = {
      names: this.names,
      missingStyle: this.missingStyle,
      checks: this.checks,
      scratch: this.scratch,
    };
    this.copying = { ...shared, copySpans: true };
    this.borrowing = { ...shared, copySpans: false };
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
    if (this.disposed) throw new Error("Highlighter is disposed");
    engine.useStyles(this.registry.map(engine.manifest.styles));
    this.renderer.sync(this.registry.tags, this.registry.attributes);
    this.engines.push(engine);
    this.names.add([engine.manifest.language, ...engine.manifest.aliases], engine);
  }

  /** Render a whole UTF-8 document as HTML; throws ResourceError on resource failure. */
  highlight(language: string, source: string | Uint8Array): string {
    if (this.disposed) throw new Error("Highlighter is disposed");
    const context = this.arena.place(source);
    const result = compose(language, context, this.borrowing);
    if (result.status === "resource") throw new ResourceError();
    return this.renderer.render(context, result.spans, result.groups, result.values);
  }

  /** automatically loads language modules required for injections. requires loadLanguage to be declared */
  async highlightFull(language: string, source: string | Uint8Array): Promise<string> {
    if (this.disposed) throw new Error("Highlighter is disposed");
    const loadLanguage = this.loadLanguage;
    if (!loadLanguage) throw new Error("highlightFull requires loadLanguage");
    const attempted = new Set<string>();
    for (;;) {
      const context = this.arena.place(source);
      const result = compose(language, context, this.borrowing);
      if (result.status === "resource") throw new ResourceError();
      const missing = [...new Set(result.missing.map(asciiLower))].filter(
        (name) => !attempted.has(name),
      );
      if (!missing.length)
        return this.renderer.render(context, result.spans, result.groups, result.values);
      await Promise.all(
        missing.map(async (name) => {
          attempted.add(name);
          let loading = this.loading.get(name);
          if (!loading) {
            loading = (async () => {
              const module = await loadLanguage(name);
              if (!module || this.names.get(name)) return;
              const manifest = readManifest(module);
              if (
                ![manifest.language, ...manifest.aliases].some(
                  (alias) => asciiLower(alias) === name,
                )
              )
                throw new Error(`Loaded module "${manifest.language}" does not register "${name}"`);
              await this.add(module);
            })().finally(() => this.loading.delete(name));
            this.loading.set(name, loading);
          }
          await loading;
        }),
      );
      if (this.disposed) throw new Error("Highlighter is disposed");
    }
  }

  /** Render a retained result produced by this highlighter. */
  render(source: string | Uint8Array, result: Extract<Result, { status: "ok" }>): string {
    if (this.disposed) throw new Error("Highlighter is disposed");
    return this.renderer.render(
      this.arena.place(source),
      result.spans,
      result.groups,
      result.values,
    );
  }

  /** Lower-level byte-span result; span ends are UTF-8 byte offsets. */
  process(language: string, source: string | Uint8Array): Result {
    if (this.disposed) throw new Error("Highlighter is disposed");
    try {
      return compose(language, this.arena.place(source), this.copying);
    } catch (error) {
      if (error instanceof ResourceError) return { status: "resource" };
      throw error;
    }
  }

  /** Mark this host unusable; its memory is released when it becomes unreachable. */
  dispose(): void {
    this.disposed = true;
  }
}
