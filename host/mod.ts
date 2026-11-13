import { compose, own, type Result } from "./composition.ts";
import { Execution, ResourceError } from "./execution.ts";
import { asciiLower, Languages, type LanguageLoader } from "./languages.ts";
import { Rendering } from "./rendering.ts";

export { AbiError } from "#/abi/mod.ts";
export { languageFor } from "../filename.ts";
export { ResourceError } from "./execution.ts";
export type { Result } from "./composition.ts";
export type { LanguageLoader } from "./languages.ts";

export class Highlighter {
  private readonly execution: Execution;
  private readonly registry: Languages;
  private readonly rendering: Rendering;
  private disposed = false;

  constructor(
    options: {
      memoryLimitBytes?: number;
      missingStyle?: string;
      checks?: boolean;
      loadLanguage?: LanguageLoader;
    } = {},
  ) {
    this.execution = new Execution(
      options.memoryLimitBytes ?? 64 * 1024 * 1024,
      options.checks ?? false,
    );
    this.rendering = new Rendering(this.execution);
    this.registry = new Languages(
      this.execution,
      options.missingStyle ?? "plain",
      options.loadLanguage,
      () => this.assertActive(),
    );
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Highlighter is disposed");
  }

  get languages(): readonly string[] {
    return this.registry.canonical.slice();
  }

  get styles(): readonly string[] {
    return this.registry.styles.slice();
  }

  async add(module: WebAssembly.Module): Promise<void> {
    this.assertActive();
    this.registry.add(module);
  }

  process(language: string, source: string | Uint8Array): Result {
    this.assertActive();
    const session = compose(this.execution, this.registry, language, source);
    return session.status === "resource" ? session : own(this.execution, session);
  }

  render(source: string | Uint8Array, result: Extract<Result, { status: "ok" }>): string {
    this.assertActive();
    if (!source.length) return "";

    const candidate = this.rendering.prepare(this.registry);
    try {
      this.execution.begin();
      const prepared = this.execution.prepare(source);
      const offset = this.execution.allocate(result.spans.byteLength);
      new Uint32Array(this.execution.memory.buffer, offset, result.spans.length).set(result.spans);
      return this.rendering.render({
        ...result,
        ...prepared,
        spans: { offset, count: result.spans.length / 2, injections: 0, groups: 0 },
      });
    } catch (error) {
      this.rendering.rollback(candidate);
      throw error;
    }
  }

  highlight(language: string, source: string | Uint8Array): string {
    this.assertActive();
    const candidate = source.length ? this.rendering.prepare(this.registry) : undefined;

    try {
      const result = compose(this.execution, this.registry, language, source);
      if (result.status === "resource") throw new ResourceError();
      return this.rendering.render(result);
    } catch (error) {
      this.rendering.rollback(candidate);
      throw error;
    }
  }

  async highlightFull(language: string, source: string | Uint8Array): Promise<string> {
    this.assertActive();
    this.registry.requireLoader();
    const input = typeof source === "string" ? source : source.slice();
    const attempted = new Set<string>();

    for (;;) {
      this.assertActive();
      const pass = (() => {
        const candidate = input.length ? this.rendering.prepare(this.registry) : undefined;
        try {
          const result = compose(this.execution, this.registry, language, input);
          if (result.status === "resource") throw new ResourceError();
          const names = result.missing.filter((name) => !attempted.has(asciiLower(name)));
          if (names.length) {
            this.rendering.rollback(candidate);
            return { names };
          }
          return { html: this.rendering.render(result) };
        } catch (error) {
          this.rendering.rollback(candidate);
          throw error;
        }
      })();
      if (pass.html !== undefined) return pass.html;

      const wave: Promise<void>[] = [];
      for (const name of pass.names!) {
        const key = asciiLower(name);
        if (attempted.has(key)) continue;
        attempted.add(key);
        wave.push(this.registry.load(key));
      }

      await Promise.all(wave);
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
