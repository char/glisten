import { test } from "avril:test";
import { equal, throws } from "#/testing/assert.ts";
import { checkRecords, encode, decode, kindOf, record, type OutputRecord } from "./mod.ts";

test("random records round trip", () => {
  let seed = 0x12345678;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const records: OutputRecord[] = [];
  for (let i = 0; i < 5000; i++) {
    const a = random();
    const b = random();
    const injection = random() & record.injectionMask;
    switch (i % 6) {
      case 0:
        records.push({ kind: "span", end: a, style: b & record.styleMask });
        break;
      case 1:
      case 2:
        records.push({ kind: "segment", end: a, injection, closes: i % 5 === 2 });
        break;
      case 3:
        records.push({ kind: "opens", injection, embeds: a });
        break;
      case 4:
        records.push({ kind: "opens", injection, name: [a, b] });
        break;
      default:
        records.push({ kind: "group", start: a, style: b & record.styleMask });
    }
  }
  records.push({ kind: "span", end: 0xffffffff, style: record.styleMask });
  equal(decode(encode(records)), records);
});

test("record kinds use distinct ABI bit patterns", () => {
  equal(
    [0, 2, 4, 5, 6, 7].map((kind) => kindOf(kind * 2 ** 29)),
    ["span", "group", "segment", "segmentCloses", "opensStatic", "opensNamed"],
  );
  for (const bits of [1, 3]) {
    throws(() => kindOf(bits * 2 ** 29), Error, /kind/i);
    throws(() => decode(Uint32Array.of(1, bits * 2 ** 29)), Error, /kind/i);
    throws(
      () => checkRecords(Uint32Array.of(1, bits * 2 ** 29), Uint32Array.of(0, 1), 0),
      Error,
      /kind/i,
    );
  }
});

test("decode rejects malformed records", () => {
  throws(() => decode(new Uint32Array([1])), Error, /odd/i);
  throws(() => decode(new Uint32Array([0, 0xe0000000])), Error, /named open/i);
  throws(() => decode(new Uint32Array([1, 0xe0000000, 0, 1])), Error, /named open/i);
});

test("encode names invalid fields", () => {
  throws(() => encode([{ kind: "span", end: 1, style: -1 }]), Error, /style/);
  throws(() => encode([{ kind: "opens", injection: -1, embeds: 0 }]), Error, /injection/);
});
