import { test } from "avril:test";
import type { Manifest, OutputRecord } from "#/abi/mod.ts";
import { compileLanguage } from "#/compiler/language.ts";
import {
  closeInjection,
  defineGrammar,
  hostPrefix,
  literal,
  on,
  openInjection,
  paint,
  saveRange,
  slot,
  token,
  wrap,
  type Grammar,
} from "#/grammar/mod.ts";
import { assert, equal, throws } from "#/testing/assert.ts";
import { puppet, type PuppetCall } from "#/testing/puppet.ts";
import { buildModule } from "#/tools/module.ts";
import { Highlighter, ResourceError } from "./mod.ts";

function manifest(language: string, options: Partial<Manifest> = {}) {
  return {
    language,
    aliases: [],
    embeds: [],
    styles: [{ name: "plain" }],
    styleMap: 0,
    areaBytes: 2048,
    ...options,
  };
}

function scripted(
  language: string,
  records: readonly OutputRecord[],
  options: Partial<Manifest> = {},
): Promise<WebAssembly.Module> {
  return puppet(manifest(language, options), [{ records, injections: 0 }], { repeat: true });
}

async function addGrammar(host: Highlighter, grammar: Grammar): Promise<void> {
  await host.add(new WebAssembly.Module(await buildModule(compileLanguage(grammar))));
}

async function rejects(promise: Promise<unknown>, message: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof Error && message.test(error.message));
    return;
  }
  throw new Error("Expected promise to reject");
}

function bracketed(target: string): Grammar {
  return defineGrammar({
    name: "root",
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          token("[", "plain", openInjection({ static: target })),
          on("-", literal("-"), hostPrefix(), paint("plain")),
          on("]", literal("]"), closeInjection(), paint("plain")),
        ],
      },
    },
  });
}

test("empty inputs bypass guests and missing languages preserve names and byte lengths", async () => {
  const empty = new Highlighter({ memoryLimitBytes: 0 });
  for (const source of ["", new Uint8Array()]) {
    equal(empty.highlight("missing", source), "");
    const result = empty.process("missing", source);
    assert(result.status === "ok");
    equal([...result.spans], []);
    equal(result.missing, []);
  }

  const host = new Highlighter({ missingStyle: "absent", checks: true });
  await host.add(
    await scripted("first", [{ kind: "span", end: 1, style: 0 }], {
      styles: [{ name: "absent", tag: "missing" }],
    }),
  );

  const result = host.process("Éx", "é!");
  assert(result.status === "ok");
  equal([...result.spans], [3, 0]);
  equal(result.missing, ["Éx"]);
  equal(host.highlight("Éx", "é!"), "<g-missing>é!</g-missing>");

  const unnamed = host.process("", "x");
  assert(unnamed.status === "ok");
  equal(unnamed.missing, []);

  const plain = new Highlighter();
  equal(plain.highlight("unknown", "x"), "x");
});

test("missing injections preserve spelling and omit empty names", async () => {
  const host = new Highlighter({ checks: true, missingStyle: "absent" });
  await host.add(
    await puppet(
      manifest("root", {
        styles: [{ name: "absent", tag: "missing" }],
      }),
      [
        {
          injections: 2,
          records: [
            { kind: "opens", injection: 0, name: [0, 3] },
            { kind: "segment", injection: 0, end: 3, closes: true },
            { kind: "opens", injection: 1, name: [3, 3] },
            { kind: "segment", injection: 1, end: 5, closes: true },
          ],
        },
      ],
      { repeat: true },
    ),
  );

  const result = host.process("root", "XYZ--");
  assert(result.status === "ok");
  equal([...result.spans], [5, 0]);
  equal(result.missing, ["XYZ"]);
  equal(host.highlight("root", "XYZ--"), "<g-missing>XYZ--</g-missing>");
});

test("registration shares styles and honors the first aliases, tags, and attributes", async () => {
  const host = new Highlighter();
  const span = [{ kind: "span", end: 1, style: 0 }] as const;

  await host.add(
    await scripted("First", span, {
      aliases: ["Shared"],
      styles: [{ name: "color", tag: "co", attribute: "v" }, { name: "bare" }],
    }),
  );
  await host.add(
    await scripted("Second", [...span, { kind: "group", start: 0, style: 0 }], {
      aliases: ["shared"],
      styles: [
        { name: "color", tag: "other", attribute: "x" },
        { name: "bare", tag: "b" },
      ],
    }),
  );
  await host.add(await scripted("Third", span, { styles: [{ name: "bare", tag: "b" }] }));

  equal(host.languages, ["First", "Second", "Third"]);
  equal(host.styles, ["plain", "color", "bare"]);
  equal(host.highlight("SHARED", "x"), "<g-co>x</g-co>");
  equal(host.highlight("sEcOnD", "x"), '<g-co v="x"><g-co>x</g-co></g-co>');
  equal(host.highlight("third", "x"), "x");

  const invalid = await scripted("invalid", span, { styles: [{ name: "color", attribute: 'v"' }] });
  await rejects(host.add(invalid), /attribute/i);

  host.dispose();
  throws(() => host.highlight("first", "x"));
  throws(() => host.process("first", "x"));
  throws(() => host.render("x", { status: "ok", spans: new Uint32Array(), missing: [] }));
  await rejects(host.add(invalid), /disposed/);
});

test("nested groups split spans, escape attributes, and remain owned across calls", async () => {
  const host = new Highlighter({ checks: true });
  await host.add(
    await scripted(
      "colors",
      [
        { kind: "span", end: 7, style: 1 },
        { kind: "group", start: 1, style: 2 },
        { kind: "span", end: 8, style: 1 },
        { kind: "group", start: 0, style: 3 },
      ],
      {
        styles: [
          { name: "plain" },
          { name: "string", tag: "s" },
          { name: "color", tag: "co", attribute: "v" },
          { name: "outer", tag: "o" },
        ],
      },
    ),
  );

  const source = 'a<&"é>z';
  const result = host.process("colors", source);
  assert(result.status === "ok" && result.groups);
  const spans = [...result.spans];
  const groups = [...result.groups];
  const values = result.values?.slice();
  equal(groups, [0, 8, host.styles.indexOf("outer"), 1, 7, host.styles.indexOf("color")]);

  const html =
    '<g-o><g-s>a</g-s><g-co v="&lt;&amp;&quot;é&gt;"><g-s>&lt;&amp;"é&gt;</g-s></g-co><g-s>z</g-s></g-o>';
  equal(host.highlight("colors", source), html);
  host.process("colors", source);
  equal([...result.spans], spans);
  equal([...result.groups], groups);
  equal(result.values, values);
  equal(host.render(source, result), html);
  equal(host.render("", result), "");
});

test("renderer escapes at span and SIMD boundaries as style tables grow", async () => {
  const host = new Highlighter({ checks: true });
  for (const length of [1, 7, 8, 15, 16, 17, 31, 32, 33]) {
    const name = `n${length}`;
    await host.add(
      await scripted(
        name,
        [
          { kind: "span", end: length, style: 0 },
          { kind: "span", end: length + 3, style: 1 },
        ],
        {
          styles: [
            { name: `short${length}`, tag: "s" },
            { name: `long${length}`, tag: "long-λ-tag" },
          ],
        },
      ),
    );

    const source = `${"a".repeat(length - 1)}&<>"`;
    equal(
      host.highlight(name, source),
      `<g-s>${"a".repeat(length - 1)}&amp;</g-s><g-long-λ-tag>&lt;&gt;"</g-long-λ-tag>`,
    );
  }

  equal(host.highlight("n1", '&<>"'), '<g-s>&amp;</g-s><g-long-λ-tag>&lt;&gt;"</g-long-λ-tag>');
});

test("input encoding handles lone surrogates and invalid UTF-8", () => {
  const host = new Highlighter();
  equal(host.highlight("x", "\ud800"), "�");
  equal(host.highlight("x", new Uint8Array([0xff, 0x3c, 0x80])), "�&lt;�");
});

test("compiled injections splice interrupted and multiple documents", async () => {
  const host = new Highlighter({ checks: true });
  await addGrammar(host, bracketed("child"));
  await addGrammar(
    host,
    defineGrammar({
      name: "child",
      initial: "root",
      states: {
        root: {
          style: "string",
          arms: [
            token("ab", "string", wrap("constant.color", { from: "arm" })),
            token("x", "plain"),
          ],
        },
      },
    }),
  );

  const plain = host.styles.indexOf("plain");
  const string = host.styles.indexOf("string");
  const color = host.styles.indexOf("constant.color");
  const merged = host.process("root", "[x][x]");
  assert(merged.status === "ok");
  equal([...merged.spans], [6, plain]);

  const result = host.process("root", "[a-b][ab]");
  assert(result.status === "ok" && result.groups);
  equal(
    [...result.spans],
    [1, plain, 2, string, 3, plain, 4, string, 6, plain, 8, string, 9, plain],
  );
  equal([...result.groups], [1, 2, color, 3, 4, color, 6, 8, color]);
  equal(result.values, ["ab", "ab", undefined]);

  const html =
    '[<g-co v="ab"><g-s>a</g-s></g-co>-<g-co v="ab"><g-s>b</g-s></g-co>][<g-co v="ab"><g-s>ab</g-s></g-co>]';
  equal(host.highlight("root", "[a-b][ab]"), html);
  equal(host.render("[a-b][ab]", result), html);
});

test("named injections resolve a name split by a host gap", async () => {
  const host = new Highlighter({ checks: true });
  const name = slot.range("name");
  await addGrammar(host, bracketed("middle"));
  await addGrammar(
    host,
    defineGrammar({
      name: "middle",
      initial: "root",
      states: {
        root: {
          style: "plain",
          arms: [
            on(
              "b",
              literal("bash"),
              saveRange(name),
              paint("plain"),
              openInjection({ named: name }),
            ),
          ],
        },
      },
    }),
  );
  await addGrammar(
    host,
    defineGrammar({
      name: "bash",
      initial: "root",
      states: { root: { style: "string", arms: [] } },
    }),
  );

  const plain = host.styles.indexOf("plain");
  const string = host.styles.indexOf("string");
  const result = host.process("root", "[ba-sh!]");
  assert(result.status === "ok");
  equal([...result.spans], [6, plain, 7, string, 8, plain]);
  equal(result.missing, []);
  equal(host.highlight("root", "[ba-sh!]"), "[ba-sh<g-s>!</g-s>]");
});

test("resource and unrelated traps are distinct, and failures recover", async () => {
  const host = new Highlighter({ checks: true });
  const calls: PuppetCall[] = [
    { records: [], injections: 0, outcome: "resource" },
    { records: [{ kind: "span", end: 1, style: 0 }], injections: 0 },
    { records: [], injections: 0, outcome: "resource" },
    { records: [{ kind: "span", end: 1, style: 0 }], injections: 0 },
    { records: [], injections: 0, outcome: "trap" },
  ];
  await host.add(await puppet(manifest("trap"), calls));

  equal(host.process("trap", "x"), { status: "resource" });
  equal(host.highlight("trap", "x"), "x");
  throws(() => host.highlight("trap", "x"), ResourceError);
  assert(host.process("trap", "x").status === "ok");
  throws(() => host.process("trap", "x"), WebAssembly.RuntimeError);

  const malformed: OutputRecord[][] = [
    [
      { kind: "span", end: 1, style: 0 },
      { kind: "span", end: 2, style: 0 },
    ],
    [{ kind: "span", end: 1, style: 0 }],
  ];
  for (const records of malformed) {
    const checked = new Highlighter({ checks: true });
    await checked.add(await scripted("bad", records));
    throws(() => checked.process("bad", "xx"), Error);
  }
});

test("memory limits are sub-page and recover after input or output exhaustion", async () => {
  const host = new Highlighter({ memoryLimitBytes: 512 });
  assert(host.process("missing", "a".repeat(300)).status === "ok");
  equal(host.process("missing", "é".repeat(300)), { status: "resource" });
  assert(host.process("missing", new Uint8Array(300)).status === "ok");
  equal(host.process("missing", new Uint8Array(600)), { status: "resource" });

  assert(host.process("missing", "&".repeat(200)).status === "ok");
  throws(() => host.highlight("missing", "&".repeat(200)), ResourceError);
  equal(host.highlight("missing", "x"), "x");

  const grow = new Highlighter({ memoryLimitBytes: 65536 });
  await grow.add(
    await puppet(manifest("grow"), [{ records: [], injections: 0, outcome: { grow: 1 } }]),
  );
  equal(grow.process("grow", "x"), { status: "resource" });
});
