import { test } from "avril:test";
import { decode } from "#/abi/records.ts";
import type { Matcher } from "#/grammar/mod.ts";
import {
  byte,
  byteSet,
  choice,
  defineGrammar,
  literal,
  on,
  optional,
  paint,
  repeat,
} from "#/grammar/mod.ts";
import { compile } from "./mod.ts";
import { buildModule } from "#/tools/module.ts";
import { Engine } from "#/host/engine.ts";
import { Arena } from "#/host/memory.ts";
import { equal } from "#/testing/assert.ts";

// An independent reading of docs/grammar.md for the matchers these grammars use. It shares
// no lowering code, so a `repeat` that stops or consumes differently shows up as wrong spans.
function members(set: string | { readonly bytes: readonly number[] }): Set<number> {
  return typeof set === "string"
    ? new Set([...set].map((character) => character.codePointAt(0)!))
    : new Set(set.bytes);
}

function matchSequence(
  matchers: readonly Matcher[],
  input: Uint8Array,
  start: number,
): number | undefined {
  let position = start;
  for (const matcher of matchers) {
    const end = match(matcher, input, position);
    if (end === undefined) return undefined;
    position = end;
  }
  return position;
}

function match(matcher: Matcher, input: Uint8Array, position: number): number | undefined {
  switch (matcher.kind) {
    case "one":
      return position < input.length && members(matcher.set).has(input[position]!)
        ? position + 1
        : undefined;
    case "literal": {
      const text = new TextEncoder().encode(matcher.text);
      if (position + text.length > input.length) return undefined;
      for (let i = 0; i < text.length; i++) if (input[position + i] !== text[i]) return undefined;
      return position + text.length;
    }
    case "opt": {
      const end = matchSequence(matcher.matchers, input, position);
      return end === undefined ? position : end;
    }
    case "either":
      for (const alternative of matcher.alternatives) {
        const end = matchSequence(alternative, input, position);
        if (end !== undefined) return end;
      }
      return undefined;
    case "repeat": {
      let end = position;
      for (;;) {
        const next = matchSequence(matcher.matchers, input, end);
        if (next === undefined || next === end) return end;
        end = next;
      }
    }
    default:
      throw new Error(`The reference does not implement ${matcher.kind}`);
  }
}

const highBytes = [0x80, 0x81, 0xa0, 0xbf, 0xc2, 0xdf, 0xe0, 0xef, 0xf0, 0xf4, 0xff];
const highSet = byteSet({ bytes: highBytes });

const arms = [
  on("a", repeat(byte("a")), paint("property")),
  on("b", repeat(choice([byte("b")], [literal("x"), byte("b")])), paint("property")),
  on("c", repeat(choice([byte("c")], [optional(literal("y"))])), paint("property")),
  on("d", repeat(choice([byte("d")], [byte("e")])), paint("property")),
  on("f", repeat(byte(byteSet({ bytes: [] }))), paint("property")),
  on("g", repeat(choice([byte("g")], [])), paint("property")),
  on("h", repeat(choice([byte("h")], [literal("hx")], [literal("xh")])), paint("property")),
  on(highSet, repeat(byte(highSet)), paint("property")),
] as const;

const grammar = defineGrammar({
  name: "repeats",
  initial: "root",
  states: { root: { style: "plain", arms } },
});

function paintStyle(arm: (typeof arms)[number]): string {
  const effect = arm.then[0]!;
  if (effect.kind !== "paint") throw new Error("Expected the arm to paint");
  return effect.style;
}

/** The spans a document must paint, from the arm list above and the reference matchers. */
function expectedSpans(source: Uint8Array, styleOf: (name: string) => number) {
  const spans: { end: number; style: number }[] = [];
  for (let position = 0; position < source.length;) {
    const arm = arms.find((candidate) => members(candidate.on).has(source[position]!));
    const end = arm && matchSequence(arm.match, source, position);
    if (arm && end !== undefined && end > position) {
      spans.push({ end, style: styleOf(paintStyle(arm)) });
      position = end;
    } else {
      spans.push({ end: position + 1, style: styleOf("plain") });
      position++;
    }
  }
  return merge(spans);
}

/** Adjacent spans of one style are written as one record. */
function merge(spans: { end: number; style: number }[]) {
  const merged: { end: number; style: number }[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && last.style === span.style) last.end = span.end;
    else merged.push({ ...span });
  }
  return merged;
}

function sources(): Uint8Array[] {
  const alphabet = [..."abcdefghxy"];
  const inputs: Uint8Array[] = [];
  const expand = (prefix: number[]) => {
    inputs.push(Uint8Array.from(prefix));
    if (prefix.length === 4) return;
    for (let i = 0; i < alphabet.length; i++) expand([...prefix, alphabet[i]!.charCodeAt(0)]);
  };
  expand([]);
  // Vector runs handle 16 bytes at a time; straddle those boundaries explicitly.
  for (const length of [15, 16, 17, 31, 32, 33]) {
    for (const byte of "abcdegh")
      inputs.push(Uint8Array.from({ length }, (_, i) => (i % 3 === 2 ? "x" : byte).charCodeAt(0)));
    inputs.push(
      Uint8Array.from([...Array.from({ length }, (_, i) => highBytes[i % highBytes.length]!), 120]),
    );
  }
  let state = 0x9e3779b9;
  for (let count = 0; count < 3000; count++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const length = state % 61;
    const input = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      input[i] = alphabet[state % alphabet.length]!.charCodeAt(0);
    }
    inputs.push(input);
  }
  return inputs;
}

test("repeated single bytes paint the spans their reference semantics describe", async () => {
  const compiled = compile(grammar);
  const arena = new Arena(1024 * 1024);
  const engine = await Engine.create(
    new WebAssembly.Module(new Uint8Array(await buildModule(compiled))),
    {
      arena,
    },
  );
  const styles = new Map<string, number>();
  for (const [index, style] of compiled.manifest.styles.entries())
    styles.set(style.name, index + 1);
  engine.useStyles(new Uint16Array(compiled.manifest.styles.map((_, index) => index + 1)));
  const styleOf = (name: string) => styles.get(name)!;

  for (const input of sources()) {
    const context = arena.place(input);
    const result = engine.call(context, new Uint32Array([0, input.length]));
    if (result.status !== "ok") throw new Error("unexpected resource failure");
    const spans = decode(result.records())
      .filter((record) => record.kind === "span")
      .map((record) => ({ end: record.end, style: record.style }));
    const message = `input ${JSON.stringify(new TextDecoder().decode(input))}`;
    try {
      equal(spans, expectedSpans(input, styleOf));
    } catch (error) {
      throw new Error(`${message}: ${(error as Error).message}`);
    }
  }
});
