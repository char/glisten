# Rust host

`rust/` contains a synchronous Wasmtime host for the same ABI-4 modules as the JavaScript host. Compile a `Language` once, share it across threads, and give each thread its own `Highlighter`.

```rust
let json = glisten::Language::new(&std::fs::read("dist/json.wasm")?)?;
let mut host = glisten::Highlighter::new()?;
host.add(&json)?;
assert_eq!(host.highlight("json", "null")?, "<g-cb>null</g-cb>");
```

`process(language, source)` returns UTF-8 byte spans, groups, and unresolved language names. Register more modules and retry to resolve missing embeddings. `render` produces whole-document HTML; `render_lines` produces independently balanced lines without CR/LF or a trailing empty line. Both use the same `<g-TAG>` vocabulary as the JavaScript renderer. A retained result belongs to its highlighter's style registry and its original source.

The default guest-memory limit is 64 MiB. `with_memory_limit` enforces an exact byte limit, including dynamically allocated guest scratch, rather than rounding allocations to Wasm pages. Injection composition is limited to 128 levels. Resource exhaustion returns an `anyhow::Error` containing `glisten::Error::Resource`; a failed call does not poison subsequent calls.

Modules and manifests are trusted compiler outputs, not arbitrary third-party plugins. The host checks the ABI version, area layout, and HTML tag/attribute safety. It does not independently prove every module invariant. Unlike the JavaScript host's batched planner, this first native implementation invokes each logical injected document separately, joining interrupted source segments and mapping spans and groups back afterward.

## Tests

```sh
nix develop -c avril task build
cargo test --release --manifest-path rust/Cargo.toml
```

The suite compares every language sample's HTML snapshot, checks span tiling and UTF-8 boundaries, and covers missing languages, multiline rendering, exact memory limits, recovery after guest resource failures, names crossing source gaps, and fragmented group attributes.
