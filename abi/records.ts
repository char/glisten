import { layout } from "./layout.ts";

const recordLayout = layout({ a: "i32", word: "i32" });
export const record = {
  bytes: recordLayout.size,
  ...recordLayout.offset,
  kindShift: 29,
  styleMask: 0x1fff_ffff,
  injectionMask: 0x1fff_ffff,
  kind: {
    span: 0b000,
    group: 0b010,
    segment: 0b100,
    segmentCloses: 0b101,
    opensStatic: 0b110,
    opensNamed: 0b111,
  },
} as const;

export type OutputRecord =
  | { kind: "span"; end: number; style: number }
  | { kind: "group"; start: number; style: number }
  | { kind: "segment"; end: number; injection: number; closes: boolean }
  | { kind: "opens"; injection: number; embeds: number }
  | { kind: "opens"; injection: number; name: readonly [start: number, end: number] };

export function kindOf(word: number): keyof typeof record.kind {
  switch (word >>> record.kindShift) {
    case 0:
      return "span";
    case 2:
      return "group";
    case 4:
      return "segment";
    case 5:
      return "segmentCloses";
    case 6:
      return "opensStatic";
    case 7:
      return "opensNamed";
    default:
      throw new Error("Invalid record kind");
  }
}

function integer(value: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`Invalid ${name}`);
  return value;
}

export function encode(records: readonly OutputRecord[]): Uint32Array {
  let wordCount = records.length * 2;
  for (const item of records) {
    if (item.kind === "opens" && !("embeds" in item)) wordCount += 2;
  }

  const words = new Uint32Array(wordCount);
  let cursor = 0;

  for (const item of records) {
    const kind = item.kind;
    if (kind === "span" || kind === "group") {
      const position = kind === "span" ? item.end : item.start;
      words[cursor++] = integer(position, 0xffff_ffff, "position");
      words[cursor++] =
        integer(item.style, record.styleMask, "style") |
        ((kind === "span" ? record.kind.span : record.kind.group) << record.kindShift);
    } else {
      const id = integer(item.injection, record.injectionMask, "injection");
      if (kind === "segment") {
        words[cursor++] = integer(item.end, 0xffff_ffff, "end");
        words[cursor++] =
          id |
          ((item.closes ? record.kind.segmentCloses : record.kind.segment) << record.kindShift);
      } else if ("embeds" in item) {
        words[cursor++] = integer(item.embeds, 0xffff_ffff, "embeds");
        words[cursor++] = id | (record.kind.opensStatic << record.kindShift);
      } else {
        words[cursor++] = 0;
        words[cursor++] = id | (record.kind.opensNamed << record.kindShift);
        const name = item.name;
        words[cursor++] = integer(name[0], 0xffff_ffff, "name start");
        words[cursor++] = integer(name[1], 0xffff_ffff, "name end");
      }
    }
  }

  return words;
}

export function decode(words: Uint32Array): OutputRecord[] {
  if (words.length % 2) throw new Error("Odd record word count");

  const result: OutputRecord[] = [];

  for (let index = 0; index < words.length; index += 2) {
    const a = words[index]!;
    const word = words[index + 1]!;
    const payload = word & record.injectionMask;

    switch (kindOf(word)) {
      case "span":
        result.push({ kind: "span", end: a, style: payload });
        break;
      case "group":
        result.push({ kind: "group", start: a, style: payload });
        break;
      case "segment":
      case "segmentCloses":
        result.push({
          kind: "segment",
          end: a,
          injection: payload,
          closes: word >>> record.kindShift === record.kind.segmentCloses,
        });
        break;
      case "opensStatic":
        result.push({ kind: "opens", injection: payload, embeds: a });
        break;
      case "opensNamed":
        if (a !== 0 || index + 3 >= words.length) throw new Error("Invalid named open");
        result.push({
          kind: "opens",
          injection: payload,
          name: [words[index + 2]!, words[index + 3]!],
        });
        index += 2;
    }
  }

  return result;
}
