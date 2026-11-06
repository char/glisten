import type { Grammar } from "#/grammar/mod.ts";
import bash from "./shell/bash/grammar.ts";
import c from "./systems/c/grammar.ts";
import capnp from "./data/capnp/grammar.ts";
import css from "./web/css/grammar.ts";
import devicetree from "./data/devicetree/grammar.ts";
import diff from "./data/diff/grammar.ts";
import dockerfile from "./build/dockerfile/grammar.ts";
import dot from "./data/dot/grammar.ts";
import fjson from "./config/fjson/grammar.ts";
import gitattributes from "./config/gitattributes/grammar.ts";
import go from "./managed/go/grammar.ts";
import html from "./web/html/grammar.ts";
import ini from "./config/ini/grammar.ts";
import java from "./managed/java/grammar.ts";
import javascript from "./web/javascript/grammar.ts";
import json from "./config/json/grammar.ts";
import jsx from "./web/jsx/grammar.ts";
import kconfig from "./build/kconfig/grammar.ts";
import kdl from "./config/kdl/grammar.ts";
import markdown from "./markup/markdown/grammar.ts";
import nginx from "./config/nginx/grammar.ts";
import ninja from "./build/ninja/grammar.ts";
import nix from "./build/nix/grammar.ts";
import proto from "./data/proto/grammar.ts";
import python from "./scripting/python/grammar.ts";
import ron from "./config/ron/grammar.ts";
import rust from "./systems/rust/grammar.ts";
import ssh_config from "./config/ssh-config/grammar.ts";
import textproto from "./data/textproto/grammar.ts";
import toml from "./config/toml/grammar.ts";
import tsx from "./web/tsx/grammar.ts";
import typescript from "./web/typescript/grammar.ts";
import zig from "./systems/zig/grammar.ts";

/** Every language, by module name (`dist/<name>.wasm`); each lives in `languages/<category>/<name>/`. */
export const languages: Readonly<Record<string, Grammar>> = {
  bash,
  c,
  capnp,
  css,
  devicetree,
  diff,
  dockerfile,
  dot,
  fjson,
  gitattributes,
  go,
  html,
  ini,
  java,
  javascript,
  json,
  jsx,
  kconfig,
  kdl,
  markdown,
  nginx,
  ninja,
  nix,
  proto,
  python,
  ron,
  rust,
  "ssh-config": ssh_config,
  textproto,
  toml,
  tsx,
  typescript,
  zig,
};
