import { test } from "avril:test";
import { popState, pushState, token, defineGrammar } from "#/grammar/mod.ts";
import { assert, equal } from "#/testing/assert.ts";
import { buildModule } from "#/tools/module.ts";
import { compile } from "./mod.ts";

const quoted = defineGrammar({
  name: "quoted",
  initial: "root",
  states: {
    root: { style: "plain", arms: [token('"', "string", pushState("quoted"))] },
    quoted: { style: "string", arms: [token('"', "string", popState())] },
  },
});

test("a grammar compiles to a validated module with its manifest", async () => {
  const compiled = compile(quoted);
  equal(compiled.manifest.language, "quoted");
  equal(
    compiled.manifest.styles.map((style) => style.name),
    ["plain", "string"],
  );
  assert(WebAssembly.validate(await buildModule(compiled)));
});
