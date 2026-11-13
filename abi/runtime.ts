import { layout } from "./layout.ts";
import type { Manifest } from "./manifest.ts";

export const ABI = 4;
export const status = { ok: 0, resource: 1 } as const;
export const memory = { align: 16, padding: 16, pageBytes: 65536 } as const;

const documentLayout = layout({ start: "i32", end: "i32" });
export const document = { bytes: documentLayout.size, ...documentLayout.offset } as const;

const segmentLayout = layout({ start: "i32", end: "i32", flags: "i32" });
export const segment = {
  bytes: segmentLayout.size,
  ...segmentLayout.offset,
  starts: 1,
  ends: 2,
} as const;

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
  scratchRequired?: WebAssembly.Global;
};

export class AbiError extends Error {}

export function readManifest(module: WebAssembly.Module): Manifest {
  const payload = WebAssembly.Module.customSections(module, "glisten")[0];
  if (!payload) throw new AbiError("missing manifest");

  const manifest = JSON.parse(new TextDecoder().decode(payload)) as Manifest;
  if (manifest.abi !== ABI) throw new AbiError(`module ABI ${manifest.abi}, host ${ABI}`);

  return manifest;
}

export const styleIdLimit = 2 ** 16;

export function validateStyleAttributes(styles: Manifest["styles"]): void {
  for (const { attribute } of styles) {
    if (attribute === undefined) continue;
    if (typeof attribute !== "string" || !/^[a-z][a-z0-9-]*$/.test(attribute))
      throw new Error(`Invalid style attribute: ${attribute}`);
  }
}
