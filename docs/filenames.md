# Filename lookup

The filename API is standalone: it does not instantiate a highlighter, load Wasm,
read the filesystem, or inspect file contents.

```ts
import { languageFor } from "./dist/filename.js";

languageFor("src/main.rs"); // "rust"
languageFor("/project/avril.conf"); // "fjson"
languageFor("Cargo.lock"); // "toml"
languageFor("CMakeLists.txt"); // "cmake"
languageFor("unknown.conf"); // undefined
```

It is also exported from `dist/host.js`. The source entry point is `filename.ts`.

The Rust crate exposes the same lookup and uses the same catalog:

```rust
assert_eq!(glisten::language_for("Cargo.lock"), Some("toml"));
assert_eq!(glisten::language_for("unknown.conf"), None);
```

## Matching rules

1. Extract the basename, accepting both `/` and `\` separators on every platform.
2. Try an exact, case-sensitive filename. These rules override extensions:
   `tsconfig.json` selects fJSON, while ordinary `.json` files select JSON.
3. Try extensions, longest first, including compound suffixes such as `js.map`.
   Extension matches prefer exact case, then fall back to ASCII-insensitive
   matching: `main.c` is C, `main.C` is C++, and `app.TS` is TypeScript.
4. Return `undefined` (Rust: `None`) for unknown or ambiguous matches. Shared
   extensions such as `.h`, `.m`, `.pl`, and `.cls` are deliberately ambiguous.

A leading dot alone does not introduce an extension: `.rs` is not a Rust file.
Dotfiles such as `.bashrc`, `.env`, and `.gitconfig` have explicit filename rules.
Directory names, glob patterns, shebangs, and file contents do not participate;
generic `.conf` and `.lock` suffixes do not imply a language.

## Catalog and manifests

Each grammar declares its own `extensions` (without leading dots) and exact
`filenames`, alongside its name and aliases. The compiler copies these fields
into the Wasm manifest. Hand-written Wasm languages declare them in their manifest.

`avril task build` generates the checked-in `_generated/languages.json` and its
`dist/languages.json` copy from those manifests before bundling the standalone
API. There is no separately maintained file-type table.
Both standalone APIs embed that generated metadata, so lookup does not depend
on which Wasm modules are available or registered at runtime.

Rebuild and commit the catalog when language metadata changes. The source API
and Rust crate consume the checked-in catalog, so they work in a fresh checkout.
The bundled `dist/filename.js` is self-contained and needs neither the JSON file
nor Wasm files at runtime.
Custom modules may include the optional manifest fields, but do not change the
bundled lookup catalog.
