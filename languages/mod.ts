import type { Grammar } from "#/grammar/mod.ts";
import c from "./systems/c/grammar.ts";
import css from "./web/css/grammar.ts";
import fjson from "./config/fjson/grammar.ts";
import json from "./config/json/grammar.ts";
import rust from "./systems/rust/grammar.ts";
import toml from "./config/toml/grammar.ts";

/** Every language, by module name (`dist/<name>.wasm`); each lives in `languages/<category>/<name>/`. */
export const languages: Readonly<Record<string, Grammar>> = {
  c,
  css,
  fjson,
  json,
  rust,
  toml,
};
