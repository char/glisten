import * as j from "@char/justin";

const manifestSchema = j.obj({
  abi: j.number,
  language: j.string,
  aliases: j.array(j.string),
  extensions: j.optional(j.array(j.string)),
  filenames: j.optional(j.array(j.string)),
  embeds: j.array(j.string),
  styles: j.array(
    j.obj({
      name: j.string,
      tag: j.optional(j.string),
      attribute: j.optional(j.string),
    }),
  ),
  styleMap: j.number,
  areaBytes: j.number,
  maxDepth: j.number,
});

export type Manifest = j.Infer<typeof manifestSchema>;
export const validateManifest = j.validation.compile(manifestSchema);

export function manifestSection(manifest: Manifest): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode("glisten");
  const jsonBytes = encoder.encode(JSON.stringify(manifest));

  const uleb = (value: number): number[] => {
    const bytes: number[] = [];
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
  };

  const encodedNameLength = uleb(nameBytes.length);
  const payloadLength = encodedNameLength.length + nameBytes.length + jsonBytes.length;
  const header = [0, ...uleb(payloadLength), ...encodedNameLength, ...nameBytes];

  const section = new Uint8Array(header.length + jsonBytes.length);
  section.set(header);
  section.set(jsonBytes, header.length);

  return section;
}
