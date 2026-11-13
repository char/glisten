import type { Grammar } from "#/grammar/mod.ts";
import type { Manifest } from "#/abi/schema.ts";
import { analyzeCompilerGrammar, layoutCompilerArea } from "./features.ts";
import { buildDispatch } from "./dispatch.ts";
import { assembleCompiled } from "./assemble.ts";

/** A compiled grammar: its WAT text and manifest (docs/abi.md). */
export type Compiled = { wat: string; manifest: Manifest };

/** Compile a grammar to one token loop (docs/grammar.md). */
export function compile(
  grammar: Grammar,
  options: { speculationScratch?: boolean } = {},
): Compiled {
  const features = analyzeCompilerGrammar(grammar, options);
  const area = layoutCompilerArea(grammar, features);
  const dispatch = buildDispatch(grammar, features, area);
  return assembleCompiled(grammar, features, area, dispatch);
}
