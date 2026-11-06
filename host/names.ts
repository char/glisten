/** Case folding required by the ABI; non-ASCII code points are unchanged. */
export function asciiLower(name: string): string {
  return name.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32));
}

/** First-registered language and alias lookup. */
export class Names<T> {
  private readonly entries = new Map<string, T>();

  add(names: readonly string[], value: T): void {
    for (const name of names) {
      const key = asciiLower(name);
      if (!this.entries.has(key)) this.entries.set(key, value);
    }
  }

  get(name: string): T | undefined {
    return this.entries.get(asciiLower(name));
  }
}
