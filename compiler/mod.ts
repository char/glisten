import type { Grammar } from "#/grammar/mod.ts";
import type { Manifest } from "#/abi/mod.ts";
import { print, type Fragment } from "#/testing/wat/mod.ts";
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

/** A hand-written module with its ABI manifest. */
export type WatSource = {
  readonly kind: "wat";
  readonly build: () => { wat: Fragment | string; manifest: Manifest };
  readonly name?: never;
  readonly initial?: never;
  readonly states?: never;
};

/** A language is either a grammar or a hand-written module, never both. */
export type LanguageSource =
  | (Grammar & { readonly kind?: never; readonly build?: never })
  | WatSource;

/** Lower either language source to the shared assembly input. */
export function compileLanguage(source: LanguageSource): Compiled {
  if (source.kind !== "wat") return compile(source);
  const { wat, manifest } = source.build();
  return { wat: typeof wat === "string" ? wat : print(wat), manifest };
}
