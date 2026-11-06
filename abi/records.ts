import { record } from "./constants.ts";

/** Decoded output record, including the trailing name pair for named opens (docs/abi.md). */
export type OutputRecord =
  | { kind: "span"; end: number; style: number }
  | { kind: "group"; start: number; style: number }
  | { kind: "segment"; end: number; injection: number; closes: boolean }
  | { kind: "opens"; injection: number; embeds: number }
  | { kind: "opens"; injection: number; name: readonly [start: number, end: number] };

const u32Max = 0xffff_ffff;
const kindNames = new Map<number, keyof typeof record.kind>(
  (Object.entries(record.kind) as [keyof typeof record.kind, number][]).map(([name, bits]) => [
    bits,
    name,
  ]),
);

/** Identify the record kind encoded in a word (docs/abi.md). */
export function kindOf(word: number): keyof typeof record.kind {
  const bits = word >>> record.kindShift;
  const kind = kindNames.get(bits);
  if (kind === undefined) throw new Error(`Invalid record kind: ${bits}`);
  return kind;
}

function checked(value: number, max: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new Error(`Invalid ${field}: ${value}`);
  return value;
}

/** Encode records to ABI words, rejecting values outside their unsigned field ranges. */
export function encode(records: readonly OutputRecord[]): Uint32Array {
  const words: number[] = [];
  for (const item of records) {
    switch (item.kind) {
      case "span":
        words.push(
          checked(item.end, u32Max, "end"),
          checked(item.style, record.styleMask, "style"),
        );
        break;
      case "group":
        words.push(
          checked(item.start, u32Max, "start"),
          (record.kind.group << record.kindShift) | checked(item.style, record.styleMask, "style"),
        );
        break;
      case "segment": {
        const kind = item.closes ? record.kind.segmentCloses : record.kind.segment;
        words.push(
          checked(item.end, u32Max, "end"),
          (kind << record.kindShift) | checked(item.injection, record.injectionMask, "injection"),
        );
        break;
      }
      case "opens": {
        const injection = checked(item.injection, record.injectionMask, "injection");
        if ("embeds" in item)
          words.push(
            checked(item.embeds, u32Max, "embeds"),
            (record.kind.opensStatic << record.kindShift) | injection,
          );
        else
          words.push(
            0,
            (record.kind.opensNamed << record.kindShift) | injection,
            checked(item.name[0], u32Max, "name start"),
            checked(item.name[1], u32Max, "name end"),
          );
        break;
      }
    }
  }
  return new Uint32Array(words);
}

/** Decode ABI words, throwing if a record or named-open pair is malformed. */
export function decode(words: Uint32Array): OutputRecord[] {
  if (words.length % 2) throw new Error("Odd record word count");
  const result: OutputRecord[] = [];
  for (let i = 0; i < words.length; i += 2) {
    const a = words[i]!;
    const word = words[i + 1]!;
    const injection = word & record.injectionMask;
    const kind = kindOf(word);
    switch (kind) {
      case "span":
        result.push({ kind: "span", end: a, style: word });
        break;
      case "group":
        result.push({ kind: "group", start: a, style: word & record.styleMask });
        break;
      case "segment":
      case "segmentCloses":
        result.push({ kind: "segment", end: a, injection, closes: kind === "segmentCloses" });
        break;
      case "opensStatic":
        result.push({ kind: "opens", injection, embeds: a });
        break;
      case "opensNamed":
        if (a !== 0 || i + 3 >= words.length) throw new Error("Malformed named open");
        result.push({ kind: "opens", injection, name: [words[i + 2]!, words[i + 3]!] });
        i += 2;
    }
  }
  return result;
}
