import type { Def, Label, Local } from "./defs.ts";
import { checkBalance } from "./scanner.ts";

/** A balanced WAT fragment with structural references and fresh names. */
export type Fragment = { readonly type: "fragment"; readonly chunks: readonly (string | Node)[] };

type Node = Fragment | Def | Label | Local;

/** Values accepted by the WAT template; strings require an explicit raw() call. */
export type Part = Node | readonly Fragment[] | number | bigint;

/** A print scope assigns fresh names in first-appearance order. */
export class Printer {
  private readonly names = new Map<Label | Local, string>();
  private next = 0;

  constructor(private readonly reserved = new Set<string>()) {}

  render(fragment: Fragment): string {
    return fragment.chunks
      .map((chunk) => {
        if (typeof chunk === "string") return chunk;
        switch (chunk.type) {
          case "fragment":
            return this.render(chunk);
          case "def":
            return `$${chunk.name}`;
          case "label":
          case "local": {
            let name = this.names.get(chunk);
            if (name === undefined) {
              do {
                name = `${chunk.hint}_${this.next++}`;
              } while (this.reserved.has(name));
              this.names.set(chunk, name);
              this.reserved.add(name);
            }
            return `$${name}`;
          }
        }
      })
      .join("");
  }
}

/** Print a fragment independently, allocating fresh names from zero for this call. */
export function print(fragment: Fragment): string {
  const reserved = new Set<string>();
  for (const ref of references(fragment)) reserved.add(ref.name);
  return new Printer(reserved).render(fragment);
}

/** Yield definition references in the order they occur, including nested fragments. */
export function* references(fragment: Fragment): Generator<Def> {
  for (const chunk of fragment.chunks) {
    if (typeof chunk === "string") continue;
    if (chunk.type === "def") yield chunk;
    else if (chunk.type === "fragment") yield* references(chunk);
  }
}

function makeFragment(chunks: (string | Node)[]): Fragment {
  checkBalance(chunks.map((chunk) => (typeof chunk === "string" ? chunk : "x")).join(""));
  return { type: "fragment", chunks };
}

/** Create a balance-checked literal WAT fragment without interpolation. */
export function raw(text: string): Fragment {
  return makeFragment([text]);
}

/** Encode bytes as a WAT string literal with hexadecimal escapes. */
export function bytes(data: Uint8Array): Fragment {
  return raw(
    '"' + Array.from(data, (byte) => `\\${byte.toString(16).padStart(2, "0")}`).join("") + '"',
  );
}

/** Construct balanced WAT; numbers and bigints must fit i32/u32 and i64/u64 respectively. */
export function wat(strings: TemplateStringsArray, ...parts: Part[]): Fragment {
  const chunks: (string | Node)[] = [strings[0]!];
  function append(part: Part): void {
    if (typeof part === "number") {
      if (!Number.isSafeInteger(part) || part < -0x80000000 || part >= 0x100000000)
        throw new Error(`Invalid WAT number: ${part}`);
      chunks.push(String(part));
    } else if (typeof part === "bigint") {
      if (part < -(1n << 63n) || part >= 1n << 64n) throw new Error(`Invalid WAT bigint: ${part}`);
      chunks.push(String(part));
    } else if (Array.isArray(part)) {
      part.forEach((item, index) => {
        if (index) chunks.push(" ");
        append(item);
      });
    } else if (typeof part === "object" && part !== null) {
      switch ((part as Node).type) {
        case "fragment":
        case "def":
        case "label":
        case "local":
          chunks.push(part as Node);
          return;
        default:
          throw new Error("Invalid WAT interpolation");
      }
    } else throw new Error("Invalid WAT interpolation");
  }
  parts.forEach((part, index) => {
    append(part);
    chunks.push(strings[index + 1]!);
  });
  return makeFragment(chunks);
}
