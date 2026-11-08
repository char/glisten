import * as j from "@char/justin";

/** Build-time manifest schema (docs/abi.md). */
export const Manifest = j.obj({
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

/** Manifest shape inferred from its build-time schema. */
export type Manifest = j.Infer<typeof Manifest>;

/** Validate a manifest during builds; not used by the host. */
export const validateManifest = j.validation.compile(Manifest);
