declare class Highlighter {
  private readonly brand;

  constructor(options?: {
    memoryLimitBytes?: number;
    missingStyle?: string;
    checks?: boolean;
    loadLanguage?: LanguageLoader;
  });

  get languages(): readonly string[];
  get styles(): readonly string[];

  add(module: WebAssembly.Module): Promise<void>;

  highlight(language: string, source: string | Uint8Array): string;
  highlightFull(language: string, source: string | Uint8Array): Promise<string>;

  process(language: string, source: string | Uint8Array): Result;
  render(source: string | Uint8Array, result: Extract<Result, { status: "ok" }>): string;

  dispose(): void;
}

type LanguageLoader = (name: string) => Promise<WebAssembly.Module | undefined>;

type Result =
  | {
      status: "ok";
      spans: Uint32Array;
      missing: string[];
      groups?: Uint32Array;
      values?: (string | undefined)[];
    }
  | { status: "resource" };

declare class AbiError extends Error {}

declare class ResourceError extends Error {
  constructor(message?: string);
}

declare function languageFor(path: string): string | undefined;

export { AbiError, Highlighter, ResourceError, languageFor };
export type { LanguageLoader, Result };
