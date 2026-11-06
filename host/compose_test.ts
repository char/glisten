import { test } from "avril:test";
import { ABI, encode, type Manifest, type OutputRecord } from "#/abi/mod.ts";
import { assert, equal, throws } from "#/testing/assert.ts";
import { composeWith, type Callee, type CallContext, type CallResult } from "./mod.ts";
import { compose } from "./compose.ts";
import { Names } from "./names.ts";
import { Scratch } from "./planning.ts";

function manifest(language: string, options: Partial<Manifest> = {}): Manifest {
  return {
    abi: ABI,
    language,
    aliases: [],
    embeds: [],
    styles: [{ name: "plain" }],
    styleMap: 0,
    areaBytes: 1024,
    maxDepth: 8,
    ...options,
  };
}

class Fake implements Callee {
  readonly calls: { source: Uint8Array; documents: number[] }[] = [];
  private map: Uint16Array = new Uint16Array();
  constructor(
    readonly manifest: Manifest,
    private readonly entries: {
      records: OutputRecord[];
      injections?: number;
      resource?: boolean;
    }[],
  ) {}
  useStyles(map: Uint16Array): void {
    this.map = map;
  }
  call(context: CallContext, documents: Uint32Array): CallResult {
    this.calls.push({ source: context.source(), documents: Array.from(documents) });
    const entry = this.entries[this.calls.length - 1]!;
    if (entry.resource) return { status: "resource" };
    const records = encode(
      entry.records.map((item) =>
        item.kind === "span" ? { ...item, style: this.map[item.style]! } : item,
      ),
    );
    return { status: "ok", injections: entry.injections ?? 0, records: () => records };
  }
}

test("empty source avoids calls", () => {
  const root = new Fake(manifest("root"), []);
  const result = composeWith([root], "root", new Uint8Array());
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing, root.calls.length], [[], [], 0]);
});

test("unknown top-level names get one missing span", () => {
  const result = composeWith([], "Unknown", new Uint8Array([1, 2]));
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[2, 0], ["Unknown"]]);
});

test("interleaved injections are batched by target and spliced in source order", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 2,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", end: 2, injection: 0, closes: false },
        { kind: "span", end: 4, style: 0 },
        { kind: "opens", injection: 1, embeds: 0 },
        { kind: "segment", end: 6, injection: 1, closes: true },
        { kind: "segment", end: 8, injection: 0, closes: true },
        { kind: "span", end: 10, style: 0 },
      ],
    },
  ]);
  const child = new Fake(manifest("child", { styles: [{ name: "child" }] }), [
    {
      records: [
        { kind: "span", end: 14, style: 0 },
        { kind: "span", end: 6, style: 0 },
      ],
    },
  ]);
  const bytes = new TextEncoder().encode("abcdefghij");
  const result = composeWith([root, child], "ROOT", bytes, { checks: true });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [2, 1, 4, 0, 8, 1, 10, 0]);
  equal(child.calls[0]!.documents, [10, 14, 4, 6]);
  equal(Array.from(child.calls[0]!.source.subarray(10, 14)), [97, 98, 103, 104]);
});

test("named missing embeds preserve spelling and empty names are not reported", () => {
  const root = new Fake(manifest("root"), [
    {
      injections: 2,
      records: [
        { kind: "opens", injection: 0, name: [0, 3] },
        { kind: "segment", end: 3, injection: 0, closes: true },
        { kind: "opens", injection: 1, name: [3, 3] },
        { kind: "segment", end: 5, injection: 1, closes: true },
      ],
    },
  ]);
  const result = composeWith([root], "root", new TextEncoder().encode("XYZ--"), { checks: true });
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[5, 0], ["XYZ"]]);
});

test("resource failure propagates from an injected child", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", end: 1, injection: 0, closes: true },
      ],
    },
  ]);
  const child = new Fake(manifest("child"), [{ records: [], resource: true }]);
  const result = composeWith([root, child], "root", new Uint8Array([1]));
  assert(result.status === "resource");
});

test("checks reject adjacent equal spans", () => {
  const root = new Fake(manifest("root"), [
    {
      records: [
        { kind: "span", end: 1, style: 0 },
        { kind: "span", end: 2, style: 0 },
      ],
    },
  ]);
  throws(
    () => composeWith([root], "root", new Uint8Array(2), { checks: true }),
    Error,
    /adjacent spans/i,
  );
});

test("aliases resolve case-insensitively and first registration wins", () => {
  const first = new Fake(manifest("first", { aliases: ["Shared"], styles: [{ name: "first" }] }), [
    { records: [{ kind: "span", end: 1, style: 0 }] },
  ]);
  const second = new Fake(
    manifest("second", { aliases: ["shared"], styles: [{ name: "second" }] }),
    [],
  );
  const result = composeWith([first, second], "SHARED", new Uint8Array([1]));
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 1]);
  equal([first.calls.length, second.calls.length], [1, 0]);
});

test("nested embeds compose and merge styles across splice boundaries", () => {
  const root = new Fake(manifest("root", { embeds: ["middle"] }), [
    {
      injections: 1,
      records: [
        { kind: "span", end: 1, style: 0 },
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", end: 3, injection: 0, closes: true },
        { kind: "span", end: 4, style: 0 },
      ],
    },
  ]);
  const middle = new Fake(manifest("middle", { embeds: ["inner"] }), [
    {
      injections: 1,
      records: [
        { kind: "span", end: 2, style: 0 },
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", end: 3, injection: 0, closes: true },
      ],
    },
  ]);
  const inner = new Fake(manifest("inner"), [{ records: [{ kind: "span", end: 3, style: 0 }] }]);
  const result = composeWith([root, middle, inner], "root", new Uint8Array(4), { checks: true });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [4, 0]);
});

test("named aliases resolve from source bytes", () => {
  const root = new Fake(manifest("root"), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, name: [0, 3] },
        { kind: "segment", end: 3, injection: 0, closes: true },
      ],
    },
  ]);
  const child = new Fake(manifest("child", { aliases: ["foo"], styles: [{ name: "child" }] }), [
    { records: [{ kind: "span", end: 3, style: 0 }] },
  ]);
  const result = composeWith([root, child], "root", new TextEncoder().encode("FOO"));
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[3, 1], []]);
});

test("checks reject records crossing a segment boundary", () => {
  const root = new Fake(manifest("root"), [{ records: [{ kind: "span", end: 3, style: 0 }] }]);
  throws(
    () => composeWith([root], "root", new Uint8Array(2), { checks: true }),
    Error,
    /crosses its end/,
  );
});

test("checks reject records that do not cover the input", () => {
  const root = new Fake(manifest("root"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  throws(
    () => composeWith([root], "root", new Uint8Array(2), { checks: true }),
    Error,
    /do not cover/,
  );
});

test("checks reject injection segments before opens", () => {
  const root = new Fake(manifest("root"), [
    { injections: 1, records: [{ kind: "segment", end: 1, injection: 0, closes: true }] },
  ]);
  throws(
    () => composeWith([root], "root", new Uint8Array(1), { checks: true }),
    Error,
    /before open/,
  );
});

test("three injections of one language are sent in a single batch", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 3,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: true },
        { kind: "opens", injection: 1, embeds: 0 },
        { kind: "segment", injection: 1, end: 2, closes: true },
        { kind: "opens", injection: 2, embeds: 0 },
        { kind: "segment", injection: 2, end: 3, closes: true },
      ],
    },
  ]);
  const child = new Fake(manifest("child", { styles: [{ name: "inside" }] }), [
    {
      records: [
        { kind: "span", end: 1, style: 0 },
        { kind: "span", end: 2, style: 0 },
        { kind: "span", end: 3, style: 0 },
      ],
    },
  ]);
  const result = composeWith([root, child], "root", new Uint8Array(3), { checks: true });
  assert(result.status === "ok");
  equal(child.calls.length, 1);
  equal(child.calls[0]!.documents, [0, 1, 1, 2, 2, 3]);
  equal(Array.from(result.spans), [3, 1]);
});

test("emission grows its span buffer without losing earlier spans", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 40, closes: true },
      ],
    },
  ]);
  const child = new Fake(manifest("child", { styles: [{ name: "a" }, { name: "b" }] }), [
    {
      records: Array.from({ length: 40 }, (_, index) => ({
        kind: "span" as const,
        end: index + 1,
        style: index % 2,
      })),
    },
  ]);
  const result = composeWith([root, child], "root", new Uint8Array(40), { checks: true });
  assert(result.status === "ok");
  equal(
    Array.from(result.spans),
    Array.from({ length: 40 }, (_, index) => [index + 1, 1 + (index % 2)]).flat(),
  );
});

test("batches interleaved aliases and multiple targets without losing source order", () => {
  const root = new Fake(manifest("root", { embeds: ["alpha", "beta"] }), [
    {
      injections: 4,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: false },
        { kind: "opens", injection: 1, embeds: 1 },
        { kind: "segment", injection: 1, end: 2, closes: true },
        { kind: "opens", injection: 2, name: [0, 1] },
        { kind: "segment", injection: 2, end: 3, closes: true },
        { kind: "segment", injection: 0, end: 4, closes: true },
        { kind: "opens", injection: 3, name: [4, 5] },
        { kind: "segment", injection: 3, end: 5, closes: true },
        { kind: "span", end: 6, style: 0 },
      ],
    },
  ]);
  const alpha = new Fake(manifest("alpha", { aliases: ["a"], styles: [{ name: "a" }] }), [
    {
      records: [
        { kind: "span", end: 8, style: 0 },
        { kind: "span", end: 3, style: 0 },
      ],
    },
  ]);
  const beta = new Fake(manifest("beta", { styles: [{ name: "b" }] }), [
    { records: [{ kind: "span", end: 2, style: 0 }] },
  ]);
  const result = composeWith([root, alpha, beta], "root", new TextEncoder().encode("a...Z."), {
    checks: true,
  });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 1, 2, 2, 4, 1, 6, 0]);
  equal(result.missing, ["Z"]);
  equal(alpha.calls[0]!.documents, [6, 8, 2, 3]);
  equal(beta.calls[0]!.documents, [1, 2]);
});

test("a single injection can have multiple interrupted segments", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: false },
        { kind: "span", end: 2, style: 0 },
        { kind: "segment", injection: 0, end: 3, closes: true },
      ],
    },
  ]);
  const child = new Fake(manifest("child", { styles: [{ name: "inside" }] }), [
    { records: [{ kind: "span", end: 5, style: 0 }] },
  ]);
  const result = composeWith([root, child], "root", new Uint8Array(3), { checks: true });
  assert(result.status === "ok");
  equal(child.calls[0]!.documents, [3, 5]);
  equal(Array.from(result.spans), [1, 1, 2, 0, 3, 1]);
});

test("named injections resolve names crossing a joined document gap", () => {
  const root = new Fake(manifest("root", { embeds: ["middle"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 2, closes: false },
        { kind: "span", end: 4, style: 0 },
        { kind: "segment", injection: 0, end: 6, closes: true },
      ],
    },
  ]);
  const middle = new Fake(manifest("middle"), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, name: [6, 10] },
        { kind: "segment", injection: 0, end: 10, closes: true },
      ],
    },
  ]);
  const bash = new Fake(manifest("bash", { styles: [{ name: "inside" }] }), [
    { records: [{ kind: "span", end: 10, style: 0 }] },
  ]);
  const result = composeWith([root, middle, bash], "root", new TextEncoder().encode("baXXsh"), {
    checks: true,
  });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [2, 1, 4, 0, 6, 1]);
  equal(result.missing, []);
});

test("a single unknown injection is reported and painted as missing", () => {
  const root = new Fake(manifest("root", { embeds: ["absent"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: true },
      ],
    },
  ]);
  const result = composeWith([root], "root", new Uint8Array(1), { checks: true });
  assert(result.status === "ok");
  equal([Array.from(result.spans), result.missing], [[1, 0], ["absent"]]);
});

test("an injection with no segments still makes a batched child call", () => {
  const root = new Fake(manifest("root", { embeds: ["child"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "span", end: 1, style: 0 },
      ],
    },
  ]);
  const child = new Fake(manifest("child"), [{ records: [] }]);
  const result = composeWith([root, child], "root", new Uint8Array(1), { checks: true });
  assert(result.status === "ok");
  equal(child.calls[0]!.documents, []);
  equal(Array.from(result.spans), [1, 0]);
});

test("a parent's link includes the last record of an injecting child", () => {
  const root = new Fake(manifest("root", { embeds: ["middle"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 3, closes: true },
      ],
    },
  ]);
  const middle = new Fake(manifest("middle", { embeds: ["inner"], styles: [{ name: "middle" }] }), [
    {
      injections: 1,
      records: [
        { kind: "span", end: 1, style: 0 },
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 3, closes: true },
      ],
    },
  ]);
  const inner = new Fake(manifest("inner", { styles: [{ name: "inner" }] }), [
    { records: [{ kind: "span", end: 3, style: 0 }] },
  ]);
  const result = composeWith([root, middle, inner], "root", new Uint8Array(3), { checks: true });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 1, 3, 2]);
});

test("a parent's link includes the last record of a multi-injection child", () => {
  const root = new Fake(manifest("root", { embeds: ["middle"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 2, closes: true },
      ],
    },
  ]);
  const middle = new Fake(manifest("middle", { embeds: ["left", "right"] }), [
    {
      injections: 2,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: true },
        { kind: "opens", injection: 1, embeds: 1 },
        { kind: "segment", injection: 1, end: 2, closes: true },
      ],
    },
  ]);
  const left = new Fake(manifest("left", { styles: [{ name: "left" }] }), [
    { records: [{ kind: "span", end: 1, style: 0 }] },
  ]);
  const right = new Fake(manifest("right", { styles: [{ name: "right" }] }), [
    { records: [{ kind: "span", end: 2, style: 0 }] },
  ]);
  const result = composeWith([root, middle, left, right], "root", new Uint8Array(2), {
    checks: true,
  });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 1, 2, 2]);
});

test("child ranges retain segment ordinals across interrupted input", () => {
  const root = new Fake(manifest("root", { embeds: ["middle"] }), [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: false },
        { kind: "span", end: 2, style: 0 },
        { kind: "segment", injection: 0, end: 4, closes: true },
      ],
    },
  ]);
  const middle = new Fake(manifest("middle", { embeds: ["absent", "leaf"] }), [
    {
      injections: 2,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 5, closes: true },
        { kind: "opens", injection: 1, embeds: 1 },
        { kind: "segment", injection: 1, end: 7, closes: true },
      ],
    },
  ]);
  const leaf = new Fake(manifest("leaf", { styles: [{ name: "leaf" }] }), [
    { records: [{ kind: "span", end: 4, style: 0 }] },
  ]);
  const result = composeWith([root, middle, leaf], "root", new Uint8Array(4), { checks: true });
  assert(result.status === "ok");
  equal(Array.from(result.spans), [2, 0, 4, 1]);
  equal(result.missing, ["absent"]);
  equal(middle.calls[0]!.documents, [4, 7]);
  equal(leaf.calls[0]!.documents, [2, 4]);
});

test("scratch keeps sibling plans independent across highlights", () => {
  const rootEntry = {
    injections: 2,
    records: [
      { kind: "opens", injection: 0, embeds: 0 },
      { kind: "segment", injection: 0, end: 1, closes: true },
      { kind: "opens", injection: 1, embeds: 1 },
      { kind: "segment", injection: 1, end: 2, closes: true },
    ] as OutputRecord[],
  };
  const childEntry = (end: number) => ({
    injections: 1,
    records: [
      { kind: "opens", injection: 0, embeds: 0 },
      { kind: "segment", injection: 0, end, closes: true },
    ] as OutputRecord[],
  });
  const root = new Fake(manifest("root", { embeds: ["alpha", "beta"] }), [rootEntry, rootEntry]);
  const alpha = new Fake(manifest("alpha", { embeds: ["leaf"] }), [childEntry(1), childEntry(1)]);
  const beta = new Fake(manifest("beta", { embeds: ["leaf"] }), [childEntry(2), childEntry(2)]);
  const leaf = new Fake(manifest("leaf", { styles: [{ name: "a" }, { name: "b" }] }), [
    { records: [{ kind: "span", end: 1, style: 0 }] },
    { records: [{ kind: "span", end: 2, style: 1 }] },
    { records: [{ kind: "span", end: 1, style: 0 }] },
    { records: [{ kind: "span", end: 2, style: 1 }] },
  ]);
  for (const callee of [root, alpha, beta]) callee.useStyles(new Uint16Array([0]));
  leaf.useStyles(new Uint16Array([1, 2]));
  const names = new Names<Callee>();
  for (const callee of [root, alpha, beta, leaf]) names.add([callee.manifest.language], callee);
  const scratch = new Scratch();
  for (let i = 0; i < 2; i++) {
    const result = compose(
      "root",
      { source: () => new Uint8Array(2) },
      { names, missingStyle: 0, checks: true, scratch },
    );
    assert(result.status === "ok");
    equal(Array.from(result.spans), [1, 1, 2, 2]);
  }
});

test("scratch resets named resolver state between highlights", () => {
  const entry = {
    injections: 1,
    records: [
      { kind: "opens", injection: 0, name: [0, 1] },
      { kind: "segment", injection: 0, end: 1, closes: true },
    ] as OutputRecord[],
  };
  const root = new Fake(manifest("root"), [entry, entry]);
  const a = new Fake(manifest("a"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  const b = new Fake(manifest("b"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  root.useStyles(new Uint16Array([0]));
  a.useStyles(new Uint16Array([1]));
  b.useStyles(new Uint16Array([2]));
  const names = new Names<Callee>();
  for (const callee of [root, a, b]) names.add([callee.manifest.language], callee);
  const scratch = new Scratch();
  let first: Uint32Array | undefined;
  for (const [name, style] of [
    ["a", 1],
    ["b", 2],
  ] as const) {
    const source = new TextEncoder().encode(name);
    const result = compose(
      "root",
      { source: () => source },
      { names, missingStyle: 0, checks: true, scratch },
    );
    assert(result.status === "ok");
    equal(Array.from(result.spans), [1, style]);
    if (first) equal(Array.from(first), [1, 1]);
    else first = result.spans;
  }
});

test("reentrant composition leases frames after the outer live plan", () => {
  const injection = (target: string) => manifest(target, { embeds: ["leaf"] });
  const entries = [
    {
      injections: 1,
      records: [
        { kind: "opens", injection: 0, embeds: 0 },
        { kind: "segment", injection: 0, end: 1, closes: true },
      ] as OutputRecord[],
    },
  ];
  const outer = new Fake(manifest("outer", { embeds: ["child"] }), entries);
  const inner = new Fake(injection("inner"), entries);
  const leaf = new Fake(manifest("leaf"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  const child = new Fake(manifest("child"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  for (const callee of [outer, inner]) callee.useStyles(new Uint16Array([0]));
  leaf.useStyles(new Uint16Array([1]));
  child.useStyles(new Uint16Array([2]));
  const names = new Names<Callee>();
  for (const callee of [outer, inner, leaf]) names.add([callee.manifest.language], callee);
  const scratch = new Scratch();
  const source = new Uint8Array(1);
  const context = { source: () => source };
  const options = { names, missingStyle: 0, checks: true, scratch };
  let nestedSpans: Uint32Array | undefined;
  names.add(["child"], {
    manifest: child.manifest,
    useStyles: (map) => child.useStyles(map),
    call: (ctx, segments) => {
      const nested = compose("inner", context, { ...options, copySpans: false });
      assert(nested.status === "ok");
      equal(Array.from(nested.spans), [1, 1]);
      nestedSpans = nested.spans;
      return child.call(ctx, segments);
    },
  });
  const result = compose("outer", context, options);
  assert(result.status === "ok");
  equal(Array.from(result.spans), [1, 2]);
  assert(nestedSpans);
  equal(Array.from(nestedSpans), [1, 1]);
});

test("scratch invalidates cached static targets when the callee changes", () => {
  const entry = {
    injections: 1,
    records: [
      { kind: "opens", injection: 0, embeds: 0 },
      { kind: "segment", injection: 0, end: 1, closes: true },
    ] as OutputRecord[],
  };
  const first = new Fake(manifest("first", { embeds: ["a"] }), [entry]);
  const second = new Fake(manifest("second", { embeds: ["b"] }), [entry]);
  const a = new Fake(manifest("a"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  const b = new Fake(manifest("b"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  a.useStyles(new Uint16Array([1]));
  b.useStyles(new Uint16Array([2]));
  const names = new Names<Callee>();
  for (const callee of [first, second, a, b]) names.add([callee.manifest.language], callee);
  const scratch = new Scratch();
  const context = { source: () => new Uint8Array(1) };
  for (const [language, style] of [
    ["first", 1],
    ["second", 2],
  ] as const) {
    const result = compose(language, context, { names, missingStyle: 0, checks: true, scratch });
    assert(result.status === "ok");
    equal(Array.from(result.spans), [1, style]);
  }
});

test("scratch invalidates cached named targets when the registry changes", () => {
  const entry = {
    injections: 1,
    records: [
      { kind: "opens", injection: 0, name: [0, 1] },
      { kind: "segment", injection: 0, end: 1, closes: true },
    ] as OutputRecord[],
  };
  const root = new Fake(manifest("root"), [entry, entry]);
  const a = new Fake(manifest("x"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  const b = new Fake(manifest("x"), [{ records: [{ kind: "span", end: 1, style: 0 }] }]);
  a.useStyles(new Uint16Array([1]));
  b.useStyles(new Uint16Array([2]));
  const scratch = new Scratch();
  const source = new TextEncoder().encode("x");
  for (const [child, style] of [
    [a, 1],
    [b, 2],
  ] as const) {
    const names = new Names<Callee>();
    names.add(["root"], root);
    names.add(["x"], child);
    const result = compose(
      "root",
      { source: () => source },
      { names, missingStyle: 0, checks: true, scratch },
    );
    assert(result.status === "ok");
    equal(Array.from(result.spans), [1, style]);
  }
});
