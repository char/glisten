import { test } from "avril:test";
import { ABI, type Manifest } from "#/abi/mod.ts";
import { compileLanguage, type LanguageSource, type WatSource } from "#/compiler/language.ts";
import type { Grammar } from "#/grammar/mod.ts";
import { Highlighter } from "#/host/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import { wat } from "#/testing/wat/mod.ts";
import { buildModule } from "./module.ts";

const manifest: Manifest = {
  abi: ABI,
  language: "tiny-template",
  aliases: [],
  embeds: [],
  styles: [{ name: "keyword", tag: "k" }],
  styleMap: 0,
  areaBytes: 16,
  maxDepth: 1,
};

function incompatibleSources(grammar: Grammar, module: WatSource): void {
  // @ts-expect-error A source cannot be both a grammar and a WAT module.
  const both: LanguageSource = { ...grammar, ...module };
  void both;
}
void incompatibleSources;

const source: LanguageSource = {
  kind: "wat",
  build: () => ({
    manifest,
    wat: wat`(module
      (import "env" "memory" (memory 1))
      (import "env" "base" (global $base i32))
      (global $records (export "records") (mut i32) (i32.const 0))
      (global (export "injections") (mut i32) (i32.const 0))
      (global (export "status") (mut i32) (i32.const 0))
      (func (export "highlight") (param $input i32) (param $length i32)
        (param $docs i32) (param $count i32) (param $out i32) (result i32)
        (global.set $records (local.get $count))
        (i32.store (local.get $out) (i32.load offset=4 (local.get $docs)))
        (i32.store offset=4 (local.get $out) (i32.load16_u (global.get $base)))
        (i32.const 0)))`,
  }),
};

test("hand-written template builds through the registry adapter and host", async () => {
  const compiled = compileLanguage(source);
  equal(compileLanguage({ kind: "wat", build: () => compiled }), compiled);
  const highlighter = new Highlighter({ checks: true });
  await highlighter.add(new WebAssembly.Module(await buildModule(compiled)));
  equal(highlighter.highlight("tiny-template", "hello"), "<g-k>hello</g-k>");
});

test("hand-written modules use build manifest validation", async () => {
  const compiled = compileLanguage(source);
  const invalid = {
    ...compiled,
    manifest: { ...manifest, aliases: "invalid" } as unknown as Manifest,
  };
  let error: unknown;
  try {
    await buildModule(invalid);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error && error.message.includes("Invalid compiler manifest"));
});
