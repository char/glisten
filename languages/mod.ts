import type { Grammar } from "#/grammar/mod.ts";
import ada from "./systems/ada/grammar.ts";
import awk from "./scripting/awk/grammar.ts";
import bash from "./shell/bash/grammar.ts";
import batch from "./shell/batch/grammar.ts";
import c from "./systems/c/grammar.ts";
import c_sharp from "./managed/c-sharp/grammar.ts";
import caddy from "./config/caddy/grammar.ts";
import capnp from "./data/capnp/grammar.ts";
import cedar from "./policy/cedar/grammar.ts";
import clojure from "./functional/clojure/grammar.ts";
import cmake from "./build/cmake/grammar.ts";
import commonlisp from "./functional/commonlisp/grammar.ts";
import cpp from "./systems/cpp/grammar.ts";
import css from "./web/css/grammar.ts";
import d from "./systems/d/grammar.ts";
import dart from "./managed/dart/grammar.ts";
import devicetree from "./data/devicetree/grammar.ts";
import diff from "./data/diff/grammar.ts";
import dockerfile from "./build/dockerfile/grammar.ts";
import dot from "./data/dot/grammar.ts";
import elisp from "./functional/elisp/grammar.ts";
import elixir from "./functional/elixir/grammar.ts";
import elm from "./functional/elm/grammar.ts";
import erlang from "./functional/erlang/grammar.ts";
import fish from "./shell/fish/grammar.ts";
import fjson from "./config/fjson/grammar.ts";
import fsharp from "./functional/fsharp/grammar.ts";
import gitattributes from "./config/gitattributes/grammar.ts";
import gleam from "./functional/gleam/grammar.ts";
import glsl from "./shaders/glsl/grammar.ts";
import go from "./managed/go/grammar.ts";
import graphql from "./query/graphql/grammar.ts";
import groovy from "./managed/groovy/grammar.ts";
import haskell from "./functional/haskell/grammar.ts";
import hcl from "./config/hcl/grammar.ts";
import hlsl from "./shaders/hlsl/grammar.ts";
import html from "./web/html/grammar.ts";
import ini from "./config/ini/grammar.ts";
import java from "./managed/java/grammar.ts";
import javascript from "./web/javascript/grammar.ts";
import jq from "./query/jq/grammar.ts";
import json from "./config/json/grammar.ts";
import jsx from "./web/jsx/grammar.ts";
import julia from "./datasci/julia/grammar.ts";
import just from "./build/just/grammar.ts";
import kconfig from "./build/kconfig/grammar.ts";
import kdl from "./config/kdl/grammar.ts";
import kotlin from "./managed/kotlin/grammar.ts";
import lua from "./scripting/lua/grammar.ts";
import make from "./build/make/grammar.ts";
import markdown from "./markup/markdown/grammar.ts";
import matlab from "./datasci/matlab/grammar.ts";
import meson from "./build/meson/grammar.ts";
import nginx from "./config/nginx/grammar.ts";
import ninja from "./build/ninja/grammar.ts";
import nix from "./build/nix/grammar.ts";
import objc from "./systems/objc/grammar.ts";
import ocaml from "./functional/ocaml/grammar.ts";
import odin from "./systems/odin/grammar.ts";
import perl from "./scripting/perl/grammar.ts";
import php from "./web/php/grammar.ts";
import powershell from "./shell/powershell/grammar.ts";
import prolog from "./proof/prolog/grammar.ts";
import proto from "./data/proto/grammar.ts";
import python from "./scripting/python/grammar.ts";
import r from "./datasci/r/grammar.ts";
import rego from "./policy/rego/grammar.ts";
import ron from "./config/ron/grammar.ts";
import ruby from "./scripting/ruby/grammar.ts";
import rust from "./systems/rust/grammar.ts";
import scala from "./managed/scala/grammar.ts";
import scheme from "./functional/scheme/grammar.ts";
import scss from "./web/scss/grammar.ts";
import solidity from "./contracts/solidity/grammar.ts";
import sql from "./query/sql/grammar.ts";
import ssh_config from "./config/ssh-config/grammar.ts";
import svelte from "./web/svelte/grammar.ts";
import swift from "./managed/swift/grammar.ts";
import textproto from "./data/textproto/grammar.ts";
import thrift from "./data/thrift/grammar.ts";
import tlaplus from "./proof/tlaplus/grammar.ts";
import toml from "./config/toml/grammar.ts";
import tsx from "./web/tsx/grammar.ts";
import typescript from "./web/typescript/grammar.ts";
import typst from "./markup/typst/grammar.ts";
import verilog from "./hdl/verilog/grammar.ts";
import vhdl from "./hdl/vhdl/grammar.ts";
import vue from "./web/vue/grammar.ts";
import wit from "./data/wit/grammar.ts";
import xml from "./markup/xml/grammar.ts";
import yaml from "./config/yaml/grammar.ts";
import zig from "./systems/zig/grammar.ts";

/** Every language, by module name (`dist/<name>.wasm`); each lives in `languages/<category>/<name>/`. */
export const languages: Readonly<Record<string, Grammar>> = {
  ada,
  awk,
  bash,
  batch,
  c,
  "c-sharp": c_sharp,
  caddy,
  capnp,
  cedar,
  clojure,
  cmake,
  commonlisp,
  cpp,
  css,
  d,
  dart,
  devicetree,
  diff,
  dockerfile,
  dot,
  elisp,
  elixir,
  elm,
  erlang,
  fish,
  fjson,
  fsharp,
  gitattributes,
  gleam,
  glsl,
  go,
  graphql,
  groovy,
  haskell,
  hcl,
  hlsl,
  html,
  ini,
  java,
  javascript,
  jq,
  json,
  jsx,
  julia,
  just,
  kconfig,
  kdl,
  kotlin,
  lua,
  make,
  markdown,
  matlab,
  meson,
  nginx,
  ninja,
  nix,
  objc,
  ocaml,
  odin,
  perl,
  php,
  powershell,
  prolog,
  proto,
  python,
  r,
  rego,
  ron,
  ruby,
  rust,
  scala,
  scheme,
  scss,
  solidity,
  sql,
  "ssh-config": ssh_config,
  svelte,
  swift,
  textproto,
  thrift,
  tlaplus,
  toml,
  tsx,
  typescript,
  typst,
  verilog,
  vhdl,
  vue,
  wit,
  xml,
  yaml,
  zig,
};
