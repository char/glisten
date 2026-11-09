# glisten

syntax highlighting for the web

## motivation

i like tree-sitter (& the arborium distribution thereof), and i like `@pierre/highlights`,
but there was nothing out there that had tree-sitter's finesse (injections!! :D) with
Pierre Highlights' performance.

so here is my take on syntax highlighting: grammars are defined in a declarative(-ish!!!) DSL
that lowers to WebAssembly directly, instead of being written straight in WAT (like pierre) or
compiling to C and then WASM (via wasm-bindgen also, like arborium)

this way, it's reasonably easy to add a new highlight language, and we also get small
and performant WASM bundles out the end of the pipeline.

## building

requires [avril](https://git.t4t.associates/char/avril), an upcoming V8 runtime.

additionally requires WABT (`wat2wasm`, `wasm-validate`) and Binaryen (`wasm-opt`),
but the flake's dev shell (`nix develop .`) can provide these for you.

```shell
avril task build
```

built output will land in a bunch of `dist/{language}.wasm` modules, `dist/host.js`, and some manifests.

## usage

once built, you can load `dist/host.js`

```typescript
import { Highlighter } from "./dist/host.js";

const highlighter = new Highlighter();
await highlighter.add(
  await WebAssembly.compileStreaming(fetch("./dist/javascript.wasm")),
);

const html = highlighter.highlight("javascript", 'console.log("hello, world!");');
```
