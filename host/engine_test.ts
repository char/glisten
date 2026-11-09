import { test } from "avril:test";
import { ABI, document, record, type Manifest } from "#/abi/mod.ts";
import { puppet, readPuppetState } from "#/testing/puppet.ts";
import { assert, equal, throws } from "#/testing/assert.ts";
import { Highlighter, Engine } from "./mod.ts";
import { Arena } from "./memory.ts";

function manifest(language = "root", options: Partial<Manifest> = {}): Manifest {
  return {
    abi: ABI,
    language,
    aliases: [],
    embeds: [],
    styles: [{ name: "plain" }, { name: "keyword" }],
    styleMap: 0,
    areaBytes: 2048,
    maxDepth: 8,
    ...options,
  };
}

test("puppet receives the ABI layout and reads host style map", async () => {
  const info = manifest();
  const wasm = await puppet(info, [
    { records: [{ kind: "span", end: 3, style: 1 }], injections: 0 },
  ]);
  const arena = new Arena(4 * 65536);
  const engine = await Engine.create(wasm, { arena });
  engine.useStyles(new Uint16Array([3, 7]));
  const context = arena.place(new Uint8Array([97, 98, 99]));
  const result = engine.call(context, new Uint32Array([0, 3]));
  assert(result.status === "ok");
  equal([Array.from(result.records()), result.injections], [[3, 7], 0]);
  const state = readPuppetState(arena.memory, engine.base, info);
  equal([state.count, state.input, state.length], [1, context.placement!.input, 3]);
  equal(state.received, [0, 3]);
  equal(Array.from(new Uint8Array(arena.memory.buffer, state.input, 19)), [
    97,
    98,
    99,
    ...new Array(16).fill(0),
  ]);
  assert(state.input % 16 === 0 && state.documents > state.input && state.output > state.documents);
});

test("engine accepts empty documents from its arena", async () => {
  const info = manifest();
  const wasm = await puppet(info, [{ records: [], injections: 0, outcome: "trap" }]);
  const arena = new Arena(65536);
  const engine = await Engine.create(wasm, { arena });
  for (const source of ["", new Uint8Array()]) {
    const context = arena.place(source);
    const result = engine.call(context, new Uint32Array([0, 0]));
    assert(result.status === "ok");
    equal(Array.from(result.records()), []);
    equal(result.injections, 0);
  }
  const inside = engine.call(arena.place("abc"), new Uint32Array([1, 1]));
  assert(inside.status === "ok");
  equal(Array.from(inside.records()), []);
  throws(() => engine.call(new Arena(65536).place(""), new Uint32Array([0, 0])), Error);
});

test("highlighter returns no output for an empty document", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(await puppet(manifest(), []));
  for (const source of ["", new Uint8Array()]) {
    equal(host.highlight("root", source), "");
    const result = host.process("root", source);
    assert(result.status === "ok");
    equal(Array.from(result.spans), []);
  }
});

test("joining beyond the shared-memory limit returns resource", async () => {
  const host = new Highlighter({ memoryLimitBytes: 65536, checks: true });
  await host.add(
    await puppet(manifest("root", { embeds: ["child"] }), [
      {
        injections: 1,
        records: [
          { kind: "opens", injection: 0, embeds: 0 },
          { kind: "segment", injection: 0, end: 20000, closes: false },
          { kind: "span", end: 20001, style: 0 },
          { kind: "segment", injection: 0, end: 40000, closes: true },
        ],
      },
    ]),
  );
  await host.add(await puppet(manifest("child"), []));
  assert(host.process("root", new Uint8Array(40000)).status === "resource");
});

test("highlighter maps module style indices and resolves aliases", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest("root", { aliases: ["ALIAS"] }), [
      { records: [{ kind: "span", end: 3, style: 1 }], injections: 0 },
    ]),
  );
  const result = host.process("alias", "abc");
  assert(result.status === "ok");
  equal(
    [host.languages, host.styles, Array.from(result.spans)],
    [["root"], ["plain", "keyword"], [3, 1]],
  );
});

test("single-module results remain owned across later highlights", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest(), [
      { records: [{ kind: "span", end: 3, style: 1 }], injections: 0 },
      { records: [{ kind: "span", end: 3, style: 0 }], injections: 0 },
    ]),
  );
  const result = host.process("root", "abc");
  assert(result.status === "ok");
  host.highlight("root", "xyz");
  equal(Array.from(result.spans), [3, 1]);
});

test("resource traps are reported and unrelated traps propagate", async () => {
  const failing = new Highlighter();
  await failing.add(
    await puppet(manifest(), [{ records: [], injections: 0, outcome: "resource" }]),
  );
  const result = failing.process("root", "x");
  assert(result.status === "resource");
  const trapping = new Highlighter();
  await trapping.add(await puppet(manifest(), [{ records: [], injections: 0, outcome: "trap" }]));
  throws(() => trapping.process("root", "x"), WebAssembly.RuntimeError);
});

test("input placement beyond the memory limit returns resource", async () => {
  const host = new Highlighter({ memoryLimitBytes: 65536 });
  await host.add(await puppet(manifest(), []));
  const result = host.process("root", new Uint8Array(65536));
  assert(result.status === "resource");
});

test("module growth leaves a readable record view", async () => {
  const host = new Highlighter({ checks: true, memoryLimitBytes: 3 * 65536 });
  await host.add(
    await puppet(manifest(), [
      {
        records: [{ kind: "span", end: 1, style: 1 }],
        injections: 0,
        outcome: { grow: 1 },
      },
    ]),
  );
  const result = host.process("root", "x");
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 1]);
});

test("growth during a child call preserves earlier parent records", async () => {
  const host = new Highlighter({ checks: true, memoryLimitBytes: 4 * 65536 });
  await host.add(
    await puppet(manifest("root", { embeds: ["child"] }), [
      {
        injections: 1,
        records: [
          { kind: "span", end: 1, style: 0 },
          { kind: "opens", injection: 0, embeds: 0 },
          { kind: "segment", end: 3, injection: 0, closes: true },
          { kind: "span", end: 4, style: 0 },
        ],
      },
    ]),
  );
  await host.add(
    await puppet(manifest("child", { styles: [{ name: "child" }] }), [
      {
        injections: 0,
        outcome: { grow: 1 },
        records: [{ kind: "span", end: 3, style: 0 }],
      },
    ]),
  );
  const result = host.process("root", "abcd");
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 0, 3, 2, 4, 0]);
});

test("module memory growth beyond the maximum is a resource failure", async () => {
  const host = new Highlighter({ memoryLimitBytes: 65536 });
  await host.add(await puppet(manifest(), [{ records: [], injections: 0, outcome: { grow: 1 } }]));
  const result = host.process("root", "a");
  assert(result.status === "resource");
});

test("zero bytes never invoke a puppet", async () => {
  const host = new Highlighter();
  await host.add(
    await puppet(manifest(), [{ records: [{ kind: "span", end: 1, style: 0 }], injections: 0 }]),
  );
  const empty = host.process("root", "");
  assert(empty.status === "ok");
  equal(Array.from(empty.spans), []);
  const next = host.process("root", "x");
  assert(next.status === "ok");
  equal(Array.from(next.spans), [1, 0]);
});

test("strings replace lone surrogates when encoded", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest(), [{ records: [{ kind: "span", end: 3, style: 0 }], injections: 0 }]),
  );
  const result = host.process("root", "\ud800");
  assert(result.status === "ok");
  equal(Array.from(result.spans), [3, 0]);
});

test("invalid UTF-8 byte input remains unchecked", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(manifest(), [{ records: [{ kind: "span", end: 2, style: 0 }], injections: 0 }]),
  );
  const result = host.process("root", new Uint8Array([255, 128]));
  assert(result.status === "ok");
  equal(Array.from(result.spans), [2, 0]);
});

test("dispose prevents further calls", () => {
  const host = new Highlighter();
  host.dispose();
  throws(() => host.process("x", "x"), Error, /disposed/);
});

test("overlapping module style lists share host IDs", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await puppet(
      manifest("root", {
        embeds: ["child"],
        styles: [{ name: "first" }, { name: "common" }],
        styleMap: 64,
      }),
      [
        {
          injections: 1,
          records: [
            { kind: "span", end: 1, style: 1 },
            { kind: "opens", injection: 0, embeds: 0 },
            { kind: "segment", end: 3, injection: 0, closes: true },
          ],
        },
      ],
    ),
  );
  await host.add(
    await puppet(
      manifest("child", { styles: [{ name: "common" }, { name: "second" }], styleMap: 64 }),
      [
        {
          injections: 0,
          records: [
            { kind: "span", end: 2, style: 0 },
            { kind: "span", end: 3, style: 1 },
          ],
        },
      ],
    ),
  );
  const result = host.process("root", "abc");
  assert(result.status === "ok");
  equal(
    [host.styles, Array.from(result.spans)],
    [
      ["plain", "first", "common", "second"],
      [2, 2, 3, 3],
    ],
  );
});

test("document placement beyond the memory limit returns resource", async () => {
  const host = new Highlighter({ memoryLimitBytes: 65536 });
  await host.add(await puppet(manifest(), []));
  const result = host.process("root", new Uint8Array(65536 - 2048 - 16 - 4));
  assert(result.status === "resource");
});

test("non-page-aligned limits are enforced at byte precision", () => {
  const arena = new Arena(65536 + 100);
  arena.ensure(65536 + 100);
  throws(() => arena.ensure(65536 + 101), Error, /memory limit/i);
});

test("small byte limits turn oversized input placement into resource failure", async () => {
  const host = new Highlighter({ memoryLimitBytes: 4096 });
  await host.add(await puppet(manifest(), []));
  const result = host.process("root", new Uint8Array(3000));
  assert(result.status === "resource");
});

test("named embeds are decoded after the producing module grows memory", async () => {
  const host = new Highlighter({ checks: true, memoryLimitBytes: 3 * 65536 });
  await host.add(
    await puppet(manifest("root"), [
      {
        injections: 1,
        outcome: { grow: 1 },
        records: [
          { kind: "opens", injection: 0, name: [0, 3] },
          { kind: "segment", injection: 0, end: 3, closes: true },
        ],
      },
    ]),
  );
  await host.add(
    await puppet(manifest("foo", { styles: [{ name: "inside" }] }), [
      {
        injections: 0,
        records: [{ kind: "span", end: 3, style: 0 }],
      },
    ]),
  );
  const result = host.process("root", "FOO");
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[3, 2], []]);
});

test("string preparation trims unused encoding capacity before placing segments", async () => {
  const info = manifest();
  const arena = new Arena(4 * 65536);
  const engine = await Engine.create(
    await puppet(info, [{ records: [{ kind: "span", end: 5, style: 0 }], injections: 0 }]),
    { arena },
  );
  engine.useStyles(new Uint16Array([0, 1]));
  const context = arena.place("ascii");
  const result = engine.call(context, new Uint32Array([0, 5]));
  assert(result.status === "ok");
  const placement = context.placement!;
  const state = readPuppetState(placement.arena.memory, engine.base, info);
  equal(Array.from(context.source()), [97, 115, 99, 105, 105]);
  equal(state.documents, Math.ceil((state.input + 5 + 16) / 4) * 4);
  equal(
    Array.from(new Uint8Array(placement.arena.memory.buffer, state.input + 5, 16)),
    new Array(16).fill(0),
  );
});

test("puppet automatically grows memory for output records", async () => {
  const host = new Highlighter({ checks: true, memoryLimitBytes: 2 * 65536 });
  await host.add(
    await puppet(manifest(), [
      {
        injections: 0,
        records: [
          { kind: "span", end: 1, style: 0 },
          { kind: "span", end: 2, style: 1 },
          { kind: "span", end: 3, style: 0 },
          { kind: "span", end: 63440, style: 1 },
        ],
      },
    ]),
  );
  const result = host.process("root", new Uint8Array(63440));
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 0, 2, 1, 3, 0, 63440, 1]);
});

test("unknown-language spans use the placed UTF-8 byte length", () => {
  const host = new Highlighter();
  const result = host.process("Missing", "Aé😀\ud800");
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[10, 0], ["Missing"]]);
});

test("reused input padding is cleared after a shorter highlight", () => {
  const arena = new Arena(65536);
  arena.place("abcdefghijklmnopqrstuv");
  const context = arena.place("x");
  const placement = context.placement!;
  equal(
    Array.from(new Uint8Array(placement.arena.memory.buffer, placement.input + 1, 16)),
    new Array(16).fill(0),
  );
});

test("call records remain directly before the next call's documents", async () => {
  const info = manifest();
  const entry = { records: [{ kind: "span" as const, end: 1, style: 0 }], injections: 0 };
  const arena = new Arena(65536);
  const engine = await Engine.create(await puppet(info, [entry, entry]), { arena });
  engine.useStyles(new Uint16Array([0, 1]));
  const context = arena.place("x");
  const memory = context.placement!.arena.memory;
  engine.call(context, new Uint32Array([0, 1]));
  const first = readPuppetState(memory, engine.base, info);
  engine.call(context, new Uint32Array([0, 1]));
  const second = readPuppetState(memory, engine.base, info);
  equal(second.documents, first.output + record.bytes);
  equal(second.output, second.documents + document.bytes);
});

test("string input succeeds when UTF-8 fits but its worst-case reservation does not", async () => {
  const host = new Highlighter({ memoryLimitBytes: 4096, checks: true });
  await host.add(
    await puppet(manifest(), [{ records: [{ kind: "span", end: 1500, style: 0 }], injections: 0 }]),
  );
  const result = host.process("root", "a".repeat(1500));
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1500, 0]);
});

test("string input that does not fit in UTF-8 returns resource", async () => {
  const host = new Highlighter({ memoryLimitBytes: 4096 });
  await host.add(
    await puppet(manifest(), [{ records: [{ kind: "span", end: 2040, style: 0 }], injections: 0 }]),
  );
  const result = host.process("root", "é".repeat(1020));
  assert(result.status === "resource");
});

test("failure to commit output returns a resource failure", async () => {
  const limit = 65536 + 100;
  const length = limit - 2048 - 16 - 8 - 4;
  const host = new Highlighter({ memoryLimitBytes: limit });
  await host.add(
    await puppet(manifest(), [
      { records: [{ kind: "span", end: length, style: 0 }], injections: 0 },
    ]),
  );
  const result = host.process("root", new Uint8Array(length));
  assert(result.status === "resource");
});

test("empty input succeeds with a zero-byte arena", () => {
  const host = new Highlighter({ memoryLimitBytes: 0 });
  const result = host.process("missing", "");
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[], []]);
});

test("unknown languages still observe the source placement limit", () => {
  const host = new Highlighter({ memoryLimitBytes: 0 });
  const result = host.process("missing", "x");
  assert(result.status === "resource");
});

test("truncated string placement fails even for an unknown language", () => {
  const host = new Highlighter({ memoryLimitBytes: 32 });
  const result = host.process("missing", "é".repeat(9));
  assert(result.status === "resource");
});
