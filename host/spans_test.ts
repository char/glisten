import { test } from "avril:test";
import { equal } from "#/testing/assert.ts";
import { Spans } from "./spans.ts";

test("appended span runs merge only at their boundaries and survive growth", () => {
  let state = 0x78ab14;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let trial = 0; trial < 100; trial++) {
    const spans = new Spans(),
      expected: number[] = [];
    let end = 0;
    for (let batch = 0; batch < 30; batch++) {
      const words: number[] = [];
      const length = random() % 24;
      let previous = -1;
      for (let i = 0; i < length; i++) {
        let style = random() % 5;
        if (style === previous) style = (style + 1) % 5;
        previous = style;
        end += 1 + (random() % 4);
        words.push(end, style);
        if (expected.length && expected[expected.length - 1] === style)
          expected[expected.length - 2] = end;
        else expected.push(end, style);
      }
      spans.append(Uint32Array.from([0, 123, ...words, 0, 123]), 2, words.length + 2);
      equal(Array.from(spans.finish()), expected);
    }
  }
});
