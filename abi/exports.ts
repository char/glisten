/** Trusted WebAssembly instance exports (docs/abi.md). */
export type Exports = {
  highlight(
    input: number,
    length: number,
    documents: number,
    count: number,
    output: number,
  ): number;
  records: WebAssembly.Global;
  injections: WebAssembly.Global;
  groups?: WebAssembly.Global;
  status: WebAssembly.Global;
  /** Peak output end plus temporary scratch, when a module uses dynamic scratch. */
  scratchRequired?: WebAssembly.Global;
};

/** Treat an instance's exports as the ABI shape without runtime validation. */
export function exportsOf(instance: WebAssembly.Instance): Exports {
  return instance.exports as unknown as Exports;
}
