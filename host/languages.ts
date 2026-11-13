import { readManifest, styleIdLimit, validateStyleAttributes, type Manifest } from "#/abi/mod.ts";
import { Execution, type Guest } from "./execution.ts";

export type LanguageLoader = (name: string) => Promise<WebAssembly.Module | undefined>;
export type Style = Manifest["styles"][number];

export const asciiLower = (name: string): string =>
  name.replace(/[A-Z]/g, (character) => character.toLowerCase());

function checkRequested(manifest: Manifest, requested: string): void {
  if (![manifest.language, ...manifest.aliases].some((name) => asciiLower(name) === requested))
    throw new Error(`Module does not register "${requested}"`);
}

export class Languages {
  readonly names = new Map<string, Guest>();
  readonly canonical: string[] = [];
  readonly styles: string[] = [];
  readonly definitions: (Style | undefined)[] = [];
  readonly missingStyle: number;
  revision = 0;
  private readonly styleIds = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly execution: Execution,
    missingStyle: string,
    private readonly loader: LanguageLoader | undefined,
    private readonly assertActive: () => void,
  ) {
    this.missingStyle = this.reserve(missingStyle);
  }

  private reserve(name: string): number {
    const existing = this.styleIds.get(name);
    if (existing !== undefined) return existing;

    const id = this.styles.length;
    if (id >= styleIdLimit) throw new Error("Too many styles");

    this.styles.push(name);
    this.definitions.push(undefined);
    this.styleIds.set(name, id);
    this.revision++;
    return id;
  }

  add(module: WebAssembly.Module): void {
    this.assertActive();
    const manifest = readManifest(module);
    validateStyleAttributes(manifest.styles);

    const newStyleIds = new Map<string, number>();
    for (const style of manifest.styles) {
      if (!this.styleIds.has(style.name) && !newStyleIds.has(style.name))
        newStyleIds.set(style.name, this.styles.length + newStyleIds.size);
    }
    if (this.styles.length + newStyleIds.size > styleIdLimit) throw new Error("Too many styles");
    const mapping = Uint16Array.from(
      manifest.styles,
      (style) => (this.styleIds.get(style.name) ?? newStyleIds.get(style.name))!,
    );
    const guest = this.execution.instantiate(module, manifest, mapping);

    for (const style of manifest.styles) {
      const id = this.reserve(style.name);
      if (this.definitions[id] === undefined) {
        this.definitions[id] = style;
        this.revision++;
      }
    }

    this.canonical.push(manifest.language);
    for (const name of [manifest.language, ...manifest.aliases]) {
      const key = asciiLower(name);
      if (!this.names.has(key)) this.names.set(key, guest);
    }
  }

  get(name: string): Guest | undefined {
    return this.names.get(name) ?? this.names.get(asciiLower(name));
  }

  async load(name: string): Promise<void> {
    this.assertActive();
    if (!this.loader) throw new Error("highlightFull requires loadLanguage");
    const key = asciiLower(name);
    if (this.names.has(key)) return;

    let pending = this.pending.get(key);
    if (!pending) {
      const loader = this.loader;
      pending = Promise.resolve().then(async () => {
        const module = await loader(key);
        this.assertActive();
        if (module) {
          checkRequested(readManifest(module), key);
          if (!this.names.has(key)) this.add(module);
        }
      });
      this.pending.set(key, pending);
      void pending
        .finally(() => {
          if (this.pending.get(key) === pending) this.pending.delete(key);
        })
        .catch(() => {});
    }

    await pending;
    this.assertActive();
  }

  requireLoader(): void {
    if (!this.loader) throw new Error("highlightFull requires loadLanguage");
  }
}
