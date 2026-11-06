# Adding a language

1. Write `languages/<category>/<name>/grammar.ts`, exporting a `defineGrammar` definition (import the API as `#/grammar/mod.ts`; `#/` is the repository root), in the category of the language's main use (see below). See the [grammar reference](grammar.md) and [style vocabulary](styles.md). Use existing grammars as examples.
2. Import and register the grammar in `languages/mod.ts`. The registry key names its `dist/<name>.wasm` output. Define aliases in the grammar when appropriate.
3. Add representative source files under `languages/<category>/<name>/samples/`, covering important constructs, edge cases, and injections. Each sample's rendered snapshot is stored alongside it as `<file>.html`.
4. Run `avril task build` and `avril task test:update`. Review the HTML diff, including escaping, boundaries, groups, and injected content; do not accept snapshot changes blindly. Run `avril task check`.

Keep grammars precise: follow the language's actual lexical and syntactic rules rather than using lookahead heuristics where a rule exists. Give subtle behavior its own sample, so its snapshot documents it. Heavier verification using corpora and tree-sitter oracles lives outside this repository.

## Categories

| Directory     | For                                                      |
| ------------- | -------------------------------------------------------- |
| `systems/`    | Systems languages close to the machine: C, Rust, Zig     |
| `managed/`    | Application languages with a managed runtime: Java, Go   |
| `scripting/`  | Dynamic languages: Python                                |
| `functional/` | Functional and declarative languages                     |
| `proof/`      | Proof assistants, specification and logic languages      |
| `datasci/`    | Data-science languages                                   |
| `hdl/`        | Hardware description languages                           |
| `web/`        | The web platform: HTML, CSS, JavaScript and its variants |
| `shell/`      | Command shells: Bash                                     |
| `config/`     | Configuration and data notations: JSON, fJSON, TOML      |
| `markup/`     | Document markup: Markdown                                |
| `build/`      | Build and packaging: Nix                                 |
| `data/`       | Schemas, interchange formats and patches                 |
| `query/`      | Query languages                                          |

Add a new category whenever none of these fits naturally; directories are free, and a forced fit costs every reader a moment. Languages sharing a builder stay together (`web/javascript` builds JSX, TypeScript and TSX).
