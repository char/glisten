/** Collect tiled spans, merging adjacent spans with identical styles. */
export class Spans {
  private words = new Uint32Array(32);
  private length = 0;

  get end(): number {
    return this.length ? this.words[this.length - 2]! : 0;
  }

  reset(): void {
    this.length = 0;
  }

  push(end: number, style: number): void {
    if (this.length && this.words[this.length - 1] === style) {
      this.words[this.length - 2] = end;
      return;
    }
    if (this.length === this.words.length) {
      const grown = new Uint32Array(this.words.length * 2);
      grown.set(this.words);
      this.words = grown;
    }
    this.words[this.length++] = end;
    this.words[this.length++] = style;
  }

  append(words: Uint32Array, start: number, end: number): void {
    if (start === end) return;
    if (this.length && this.words[this.length - 1] === words[start + 1]) {
      this.words[this.length - 2] = words[start]!;
      start += 2;
    }
    const length = end - start;
    if (!length) return;
    if (this.length + length > this.words.length) {
      const grown = new Uint32Array(Math.max(this.length + length, this.words.length * 2));
      grown.set(this.words);
      this.words = grown;
    }
    this.words.set(words.subarray(start, end), this.length);
    this.length += length;
  }

  finish(copy = true): Uint32Array {
    return copy ? this.words.slice(0, this.length) : this.words.subarray(0, this.length);
  }
}
