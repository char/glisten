declare class Highlighter {
  private readonly arena;

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

declare function languageFor(path: string): string | undefined;

declare function composeWith(
  callees: Callee[],
  language: string,
  source: Uint8Array,
  options?: { missingStyle?: string; checks?: boolean },
): Result;

type Callee = {
  readonly manifest: Manifest;
  useStyles(map: Uint16Array): void;
  call(context: CallContext, documents: Uint32Array): CallResult;
};

type CallContext = {
  readonly source: () => Uint8Array;
  readonly placement?: {
    readonly input: number;
    readonly arena: Arena;
  };
};

type CallResult =
  | {
      status: "ok";
      records: () => Uint32Array;
      injections: number;
      groups?: number;
      groupValues?: ReadonlyMap<number, string>;
    }
  | { status: "resource" };

declare class Engine implements Callee {
  private constructor();
  private readonly arena;

  readonly manifest: Manifest;
  readonly base: number;

  static create(
    module: WebAssembly.Module,
    options?: { arena?: Arena; memoryLimitBytes?: number },
  ): Promise<Engine>;

  useStyles(map: Uint16Array): void;
  call(context: CallContext, documents: Uint32Array): CallResult;
}

declare class AbiError extends Error {}

declare class ResourceError extends Error {
  constructor(message?: string);
}

type Manifest = {
  abi: number;
  language: string;
  aliases: string[];
  extensions?: string[] | undefined;
  filenames?: string[] | undefined;
  embeds: string[];
  styles: {
    name: string;
    tag?: string | undefined;
    attribute?: string | undefined;
  }[];
  styleMap: number;
  areaBytes: number;
  maxDepth: number;
};

declare class Arena {
  private readonly brand;

  readonly limit: number;
  readonly memory: WebAssembly.Memory;
  buffer: ArrayBuffer;

  constructor(limit: number);

  refresh(): void;
  ensure(end: number): void;
  allocateArea(bytes: number): number;

  place(source: string | Uint8Array): CallContext;
  join(
    context: CallContext,
    pieces: readonly SourceRange[],
  ): { context: CallContext; range: SourceRange };

  begin(): void;
  allocate(bytes: number, alignment?: number): number;
  outputStart(): number;
  commitOutput(end: number): void;
}

type SourceRange = { readonly start: number; readonly end: number };

export { AbiError, Engine, Highlighter, ResourceError, composeWith, languageFor };
export type { Callee, CallContext, CallResult, LanguageLoader, Result };
