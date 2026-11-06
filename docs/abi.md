# Module/host ABI

The current module/host contract is ABI version **4**.

```
grammar.ts ─compiler─▶ .wat ─wat2wasm / wasm-opt─▶ dist/<name>.wasm (with manifest)
host: owns memory · calls modules · composes ──▶ Result
modules never call each other or the host
```

## 1. Module

```wat
(module
  (import "env" "memory" (memory 1))           ;; shared by all of a host's modules
  (import "env" "base" (global $base i32))     ;; start of this module's area
  (data (global.get $base) "…")                ;; static tables; no init call

  (global $records    (export "records")    (mut i32) …)  ;; records written by the last call
  (global $injections (export "injections") (mut i32) …)  ;; injections it opened
  ;; Only modules whose grammar uses wrap:
  (global $groups (export "groups") (mut i32) …)          ;; groups written by the last call
  (global $status     (export "status")     (mut i32) …)  ;; set before any trap
  ;; Optional for modules that use dynamically allocated scratch:
  (global $scratchRequired (export "scratchRequired") (mut i64) …)
  ;; written on return and in $fail; hot counters live in internal globals

  (func (export "highlight")                   ;;
    (param $input i32) (param $length i32)
    (param $documents i32) (param $count i32)
    (param $output i32)
    (result i32)))                             ;; status
```

Features: SIMD, bulk memory, multi-value, mutable-global exports.

```ts
// custom section "glisten", UTF-8 JSON
type Manifest = {
  abi: number; // §11
  language: string; // lower case
  aliases: string[]; // matched ignoring ASCII case
  embeds: string[]; // static embeds, by name (§9)
  styles: { name: string; tag?: string; attribute?: string }[]; // the styles its grammar paints, with
  // their HTML tags (§7); plain has none
  styleMap: number; // offset in the area of a u16 per style, written by the host (§7)
  areaBytes: number; // multiple of 16
  maxDepth: number; // frame capacity
};
```

## 2. Memory

```
0 ┌ area: json        base = env.base, areaBytes long, 16-aligned
  ├ area: nix
  ├ …                 in add order
  ├ input             16-aligned, + 16 readable bytes
  ├ documents         per call
  └ output ▲          each call's records after the previous call's, kept until the
                      call tree is composed; a module may memory.grow
     … ▼ scratch      a call's working storage (e.g. queue entries),
                      growing down from the end of memory; the records grow up to
                      meet it, and growing memory moves it to the new end
max = memoryLimitBytes
```

| Region            | Module reads                                                                                               | Module writes |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| own area          | ✓                                                                                                          | ✓             |
| other areas       | ✗                                                                                                          | ✗             |
| input             | any 16-aligned window over it, ≤ 16 bytes past end; their values never matter                              | ✗             |
| style map         | ✓ (in its area; the host writes it once, at add)                                                           | ✗             |
| documents         | ✓                                                                                                          | ✗             |
| output            | ✓                                                                                                          | ✓             |
| above its records | ✓: scratch during the call, growing down from the end of memory (moved up when memory grows); never output | ✓             |

A module using dynamic scratch exports `scratchRequired`: the peak, over the call, of the absolute output end plus the scratch size. The host checks this against its exact logical memory limit before accepting a successful call. This check is necessary because Wasm memory limits are page-rounded; the physical scratch address at the end of memory does not itself enforce a non-page-aligned host limit. Modules without dynamic scratch omit the export.

## 3. Calls

```ts
// host guarantees; violations are host bugs, and a module may trap without a status
input % 16 === 0;
styleMapWritten(module); // §7
wellFormed(documents); // §4
!inProgress(module); // not reentrant

// the caller's precondition, unchecked
validUtf8(input); // violated: styles are unspecified, but the call
// stays memory-safe, bounded, and §5/§10 hold

const status = { ok: 0, resource: 1 }; // resource: depth, transitions, grammar failure, or memory
```

```wat
(func $fail (global.set $status (i32.const 1)) (unreachable))
```

```ts
// host side
let code: number;
try {
  code = m.highlight(input, length, documents, count, output);
} catch (error) {
  if (!(error instanceof WebAssembly.RuntimeError) || m.status.value !== status.resource)
    throw error;
  code = status.resource;
}
// `records` and `injections` are valid only on success.
```

No state survives between calls, failed or not.

## 4. Documents

```ts
type Document = { start: u32; end: u32 }; // 8 bytes: one contiguous text
```

```
document     a module call highlights each document independently: state is fresh at its
             start, the byte before it is "\n", and its end is the end of the text
bytes        UTF-8, unchecked (§3): modules never decode it to stay safe, so malformed
             input gets some valid tiling of spans, possibly splitting its sequences
order        any order; documents may be empty only if the call has none
```

An embedded document is usually interrupted in its source (a Bash string interpolated
in Nix, a fence inside a quoted list). The host owns those gaps: it keeps a document's
**segments** (source ranges, flagged `starts` at the first and `ends` at the last) for
composition (§8), joins a multi-segment document into one contiguous buffer before the
call (single-segment documents are passed in place), and maps the call's records back
to source offsets, splitting any record that crosses a gap. Highlighting therefore
never depends on how the source was split.

```
nix source   ''echo "${ { b = ''make "x''; } }" done''
bash A         ├─A1───┤                       ├─A2───┤
bash B                         ├─B1───┤
bash call    [A1 starts] [A2 ends] [B1 starts|ends]     one call, two documents
```

## 5. Output records

```
record = [a: u32, word: u32]                 8 bytes, start implied

word: 31 30 29 │ 28 … 0
       0  0  0 │ style (host id)  span                a = end
       0  1  0 │ style (host id)  group               a = start
       1  0  0 │ injection        segment             a = end
       1  0  1 │ injection        segment, closes     a = end       → `ends` in child call
       1  1  0 │ injection        opens, static       a = embeds index
       1  1  1 │ injection        opens, named        a = 0, then pair [nameStart, nameEnd]
```

```
tiling       per document, records cover [start, end) exactly; a record starts where the
             previous ended, or at the next document's start once one is covered
no crossing  no record crosses a document's end (after mapping: a segment's end)
merged       no two adjacent spans in a document share a style; a group breaks merging
groups       zero-width at the tiling position (end), non-empty [a, end), within the
             document, laminar and emitted inner-first for equal ends; flush the pending
             span before emitting a group
opens        before its injection's first segment record; injections count from 0 per call
```

````
source   ```bash⏎echo hi⏎```⏎        (offsets 0 3 7 8 16 19 20)

[ 3, span pd]
[ 0, opens named #0] [3, 7]          name "bash"
[ 7, span label]
[ 8, span plain]
[16, segment closes #0]              "echo hi⏎" → bash call, document [8, 16]
[19, span pd]
[20, span plain]
````

## 6. Host result

```ts
highlight(language, source): string     // HTML spans and nested group elements; escaped text
                                        // and, for groups, escaped manifest attributes
_process(language, source): Result      // public, not promoted: the spans themselves

type Result =                                                              //
  | { status: "ok"; spans: Uint32Array; missing: string[] }
  | { status: "resource" };
// spans = [end₀, style₀, end₁, style₁, …]; span i covers [end_{i-1} ?? 0, end_i);
// style indexes host.styles. Same layout as span records: a call tree without
// injections returns one copy of the module's output, untouched.
// _process optionally exposes groups: Uint32Array [start, end, style, ...],
// ordered by start, then decreasing end. Absent when there are no groups.
// values?: (string | undefined)[] is parallel to groups: a string is the full
// logical group text for a fragment; undefined means source[start, end).
// The offsets are UTF-8 byte offsets into the source. A tagged group wraps its
// spans in <g-TAG>; an optional manifest attribute receives the group text,
// escaped for a double-quoted HTML attribute. Span elements split at group boundaries.
// highlight() throws ResourceError where _process returns "resource".
```

## 7. Styles

```ts
manifest.styles = [{ name: "plain" }, { name: "keyword", tag: "k" }, …];     //
host.styles: string[];                                // registry, grows on add, ids < 2¹⁶
host.attributes: (string | undefined)[];              // first registration wins, as for tags
host.tags: (string | undefined)[];                    // by id; the first module to
                                                      // register a name sets its tag
// at add, before any call:
for (const [i, { name }] of manifest.styles.entries())
  u16(base + manifest.styleMap + 2 * i) = host.styles.indexOf(name) ⇐ registered if new;
// the module looks styles up when it writes a span: records carry host ids
attribute    optional lowercase ASCII name matching [a-z][a-z0-9-]*; validated at build and add
theme: CSS for the <g-TAG> elements                  // not ABI; vocabulary in styles.md
```

Languages stay independent (a new style rebuilds nothing else), and nothing remaps spans.

## 8. Composition

Two phases, so each span is copied exactly once however deep the nesting:

```ts
// 1. calls: records stay in memory where each module wrote them
function plan(module: Module, segments: Uint32Array): Call {
  const call = run(module, segments);            // output after the previous call's
  if (!call.injections) return call;             // export `injections`: no scan needed
  const injections = scan(call);                 // opens, segment records, per-segment record index
  for (const [language, ids] of groupBy(injections, ({ name }) => resolve(name))) {
    const target = language && modules.get(language);
    if (!target) { markMissing(ids); continue; }
    const batch = concat(ids.map((id) => withStarts(injections[id].segments)));
    link(ids, plan(target, batch));              // one call per language per level
  }
  return call;
}

// 2. emit: one walk over the call tree, writing the result directly
function emit(call: Call, from: number, to: number, out: Spans) { // record index range
  for (const r of records(call, from, to))
    switch (kind(r)) {
      case "span":    out.push(r.end, r.style); break;                  // merges equal neighbors
      case "segment": r.child ? emit(r.child.call, …r.child.range, out) // that segment's records
                              : out.push(r.end, missingStyle); break;
      case "opens":   break;
    }
}
```

```
fast path    one call, no injections or groups → spans = records.slice(), nothing else
             an absent groups export means zero; the host does not scan records to detect groups
memory       views on records are made in phase 2, after the last call may have grown memory
```

A failure anywhere fails the tree.

## 9. Names

```ts
resolve(name) = names.get(asciiLower(name));  // language + aliases; first added wins
static embed   → manifest.embeds[a]
named embed    → source.slice(nameStart, nameEnd)
unresolved     → painted host.missingStyle, reported in `missing` unless empty
compiler       → embeds are names, not build dependencies
                 (Markdown front matter embeds "yaml" before a YAML module exists)
```

## 10. Invariants

```
host result   covers [0, length); non-empty spans; no equal neighbors
each call     records tile its documents (§5)
calls         same call ⇒ same records, whatever ran before (failures included)
```

The host can optionally check module records.

## 11. Versioning

```ts
if (manifest.abi !== ABI) throw new AbiError(`module ABI ${manifest.abi}, host ${ABI}`);
// ABI = 4; any change to §1–§9 bumps ABI
// beyond the version the host trusts a module and its manifest: both are validated when
// built; a module that breaks the ABI is garbage in (wasm memory is sandboxed, so the
// worst outcome is wrong output, a trap, or an exception)
```
