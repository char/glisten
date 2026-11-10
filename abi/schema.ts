import * as j from "@char/justin";
import type { Manifest } from "./manifest.ts";

export type { Manifest };

/** Build-time manifest schema (docs/abi.md). */
const manifestSchema = j.obj({
  abi: j.number,
  language: j.string,
  aliases: j.array(j.string),
  extensions: j.optional(j.array(j.string)),
  filenames: j.optional(j.array(j.string)),
  embeds: j.array(j.string),
  styles: j.array(
    j.obj({ name: j.string, tag: j.optional(j.string), attribute: j.optional(j.string) }),
  ),
  styleMap: j.number,
  areaBytes: j.number,
  maxDepth: j.number,
});

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
true satisfies Equal<j.Infer<typeof manifestSchema>, Manifest>;

/** Validate a manifest during builds; not used by the host. */
export const validateManifest = j.validation.compile(manifestSchema);
