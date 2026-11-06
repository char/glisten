import { ABI, names } from "./constants.ts";
import type { Manifest } from "./schema.ts";

export type { Manifest };

/** A missing manifest or incompatible ABI version. */
export class AbiError extends Error {}

/** Read the manifest, checking only its ABI version (docs/abi.md). */
export function readManifest(module: WebAssembly.Module): Manifest {
  const section = WebAssembly.Module.customSections(module, names.section)[0];
  if (section === undefined) throw new AbiError("Not a glisten module: missing manifest");
  const manifest: Manifest = JSON.parse(new TextDecoder().decode(section));
  if (manifest.abi !== ABI) throw new AbiError(`module ABI ${manifest.abi}, host ${ABI}`);
  return manifest;
}

/** Encode a manifest as a complete WebAssembly custom section. */
export function manifestSection(manifest: Manifest): Uint8Array {
  const encoder = new TextEncoder();
  const name = encoder.encode(names.section);
  const payload = encoder.encode(JSON.stringify(manifest));
  const leb = (value: number): number[] => {
    const out: number[] = [];
    do {
      let byte = value % 128;
      value = Math.floor(value / 128);
      if (value) byte |= 128;
      out.push(byte);
    } while (value);
    return out;
  };
  const content = [...leb(name.length), ...name, ...payload];
  return new Uint8Array([0, ...leb(content.length), ...content]);
}

/** Reject attribute names that are unsafe in generated HTML. */
export function validateStyleAttributes(styles: Manifest["styles"]): void {
  for (const { attribute } of styles) {
    if (
      attribute !== undefined &&
      (typeof attribute !== "string" || !/^[a-z]/.test(attribute) || /[^a-z0-9-]/.test(attribute))
    )
      throw new Error(`Invalid style attribute: ${attribute}`);
  }
}
