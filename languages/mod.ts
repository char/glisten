import type { Grammar } from "#/grammar/mod.ts";
import bash from "./shell/bash/grammar.ts";
import c from "./systems/c/grammar.ts";
import css from "./web/css/grammar.ts";
import fjson from "./config/fjson/grammar.ts";
import javascript from "./web/javascript/grammar.ts";
import json from "./config/json/grammar.ts";
import jsx from "./web/jsx/grammar.ts";
import nix from "./build/nix/grammar.ts";
import rust from "./systems/rust/grammar.ts";
import toml from "./config/toml/grammar.ts";
import tsx from "./web/tsx/grammar.ts";
import typescript from "./web/typescript/grammar.ts";
import zig from "./systems/zig/grammar.ts";

/** Every language, by module name (`dist/<name>.wasm`); each lives in `languages/<category>/<name>/`. */
export const languages: Readonly<Record<string, Grammar>> = {
  bash,
  c,
  css,
  fjson,
  javascript,
  json,
  jsx,
  nix,
  rust,
  toml,
  tsx,
  typescript,
  zig,
};
