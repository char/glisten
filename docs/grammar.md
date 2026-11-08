# States grammar reference

The API in `grammar/` defines a byte-oriented state machine compiled to WebAssembly. A grammar paints spans and may delegate ranges to another language. Use
`defineGrammar` to check a definition before compiling it. The
closed style vocabulary is in `grammar/styles.ts`; styles and static injection
names are collected into the compiled module's manifest. Optional `aliases`,
`extensions` (suffixes without leading dots), and `filenames` (exact basenames)
on the grammar are also copied into the manifest. The standalone
[filename lookup API](filenames.md) uses a build-generated catalog of this metadata.

```ts
import { defineGrammar, popState, pushState, token } from "#/grammar/mod.ts";

export default defineGrammar({
  name: "quoted",
  initial: "root",
  states: {
    root: { style: "plain", arms: [token('"', "string", pushState("quoted"))] },
    quoted: { style: "string", arms: [token('"', "string", popState())] },
  },
});
```

## Input and documents

Input is a byte array, normally UTF-8. All offsets are byte offsets into that
array, not character indices. A call supplies documents `{ start, end }`, each a
contiguous text highlighted independently. See [the ABI](abi.md) for the host's
preconditions, the record representation, and how the host joins a document that
is interrupted in its source (so a grammar never sees a gap, and highlighting never
depends on how the source was split).

At a document's start the machine resets to `initial` with an empty stack, unset
slots, no host, an empty shell capture and queues, physical column zero, and the
byte before the document is LF. No state survives a call. The end of a document is
the end of the text: `lineEnd` holds there, and open hosts, heredoc bodies and
speculation end there.

Valid UTF-8 is a caller precondition for meaningful styles. Malformed input
remains memory-safe and bounded, with valid output tiling, but its styles are
unspecified. The `character` matcher and fallback use the leading byte to choose
an expected length of 1–4 and consume only available consecutive continuation
bytes up to that length; they do not validate Unicode scalar values.

## States, arms, and byte sets

`initial` explicitly names the initial state; declaration order is not the
initial-state rule. Each state has a default `style` and an ordered `arms`
array. At a byte, only arms whose dispatch set contains that byte are tried,
in declaration order. Dispatch does **not** consume the byte. An arm's matchers
run left to right from that position. If one fails, the next eligible arm is
tried from the original position. A normal `on` arm succeeds only if its entire
sequence succeeds and consumes at least one byte. Its effects run left to right,
including the single `paint` or a single `classify` effect. Nothing after a
successful arm is tried for that byte.

A set string is shorthand for its ASCII bytes; non-ASCII characters are rejected.
`ascii(text)` constructs the same kind of set explicitly, while `utf8Bytes(text)`
uses the bytes of its UTF-8 encoding. `range(a, b)` is inclusive and requires
single ASCII endpoints in ascending order. `byteSet({ bytes, ranges })` accepts
numeric bytes and inclusive numeric ranges in 0–255; `union`, `intersection`,
and `except` combine sets. Empty sets are permitted. For example:

```ts
const digit = range("0", "9");
const ident = union("_", range("a", "z"), range("A", "Z"));
on(ident, byte(ident), bytes(union(ident, digit), { min: 0 }), paint("variable"));
```

An `on` call takes the dispatch set, then matchers, then effects. The dispatch
set must include every byte on which the author wants the arm tried; dispatch
is not inferred for arbitrary matchers. `token(text, style, ...effects)` is
sugar for an `on` arm with a literal matcher and paint, dispatched on the first
UTF-8 byte; empty text is rejected. `token(oneOf(set), style, ...effects)`
dispatches on the set and matches exactly one byte from it. `keywordTable`
constructs ordered cases for `classify`. These helpers build ordinary IR and
add no runtime behavior.

When no arm succeeds, a state with no `otherwise` paints the next document-bounded
character in its default style; implementations may scan equivalent runs in
bulk. A string `otherwise` does that painting, then replaces the state. A
nonempty effect-list `otherwise` instead applies stack effects
(`pushState`, `popState`, `setState`) and retries the same byte without
painting. It may also open an injection at that byte, subject to the same
state-change restriction as a zero-width redispatch. A state's optional
`captureFallback` also appends fallback bytes to the shell capture.

Use `redispatch(set, ...steps)` for an explicit non-painting, zero-width arm.
It retries the same byte after its effects. Its matchers may be `shell.queueHas`
or zero-width `lookahead`, `notLookahead`, `notNext`, `previousNotIn`, `lineStart`,
or `lineEnd` assertions. Lookaheads can contain consuming matchers such as
`indentTo` without consuming input themselves. Permitted effects are stack actions, `shell.queueSave`,
`shell.queueOpen`, `closeInjection`, `shell.captureReset`, `shell.captureMark`,
`openInjection`, and `abandon`; capture reset/mark requires a stack action. A
zero-width injection open requires exactly one stack action: a push or goto
must target a different state, and a pop must have an `atRoot` fallback to a
different state. This prevents an open without a state change, including at
root. The validator checks these restrictions. Consecutive redispatches and
effect-list fallbacks are bounded; consuming or fallback painting resets the transition count.

```ts
redispatch(";", setState("afterValue")); // retry the semicolon in afterValue
```

## Matcher semantics

A matcher either returns a position at or after its start or fails. A failed
sequence fails as a whole; nested constructs below specify where they restore
position. No matcher consumes beyond the document. Successful
zero-width matchers are useful inside a sequence, but a consuming arm whose
whole sequence has zero length fails.

- `literal(text)` matches exactly the UTF-8 encoding of `text`, including the
  empty string. It fails if any byte differs or the literal runs past the document end.
- `byte(set)` consumes one member of `set`; it fails at the document end or on a
  nonmember. `character()` consumes the document-bounded character described
  above, failing at the document end.
- `bytes(set, { min, max, untilColumn })` greedily consumes members, up to
  `max` if given; `untilColumn` additionally stops before a byte starting at or
  beyond that zero-based physical column. Columns advance according to `tabStop`
  and UTF-8 character boundaries, including across segments. `untilColumn` is an
  integer in 0..2,147,483,647. `min` defaults to 1. It fails if fewer than `min`
  bytes were consumed. Bounds are integers in 0..2,147,483,647, with
  `max >= min`. No backtracking shortens
  the run to make a later matcher succeed.
- `seq(...matchers)` makes a matcher sequence. `choice(...sequences)` tries
  each sequence from the same start and chooses the first complete success;
  later failure does not backtrack into that choice. `optional(...matchers)`
  consumes the sequence on success and otherwise succeeds at its original
  position. `repeat(...matchers)` greedily repeat a
  sequence, stopping before a failure or an iteration that makes no progress.
  They are possessive and can succeed without consuming.
- `lookahead(...matchers)` succeeds without consuming if the sequence succeeds;
  `notLookahead(...matchers)` succeeds without consuming if it fails. A nested
  attempt remains document-bounded. `notNext(set)` succeeds without consuming
  if the next byte is not in the set, including at the document end.
  `previousNotIn(set)` similarly checks the preceding visible byte.
  `previousCharIn(ranges)` and `previousCharNotIn(ranges)` test the preceding
  UTF-8 scalar against inclusive numeric code-point ranges, without consuming.
  At document start the preceding scalar is LF. Malformed UTF-8 is not in any
  range, so it satisfies only the negated matcher. Ranges must have ordered
  integer endpoints in 0..0x10FFFF.
  `lineStart()` succeeds at document start or immediately after an LF; document
  start supplies an LF sentinel.
  It is an assertion, not an indentation test, and is equivalent to
  `previousNotIn` of every byte except LF. `lineEnd()` succeeds before LF or at
  the document end. `columnAtLeast(n)` tests the zero-based physical column at
  the arm start, without consuming; `n` is an integer in 0..2,147,483,647. It is
  only valid as an arm's first matcher because the physical column is current at
  that position.
- `cachedPrefix(name, first, rest, ...suffix)` requires the first byte in
  `first`, greedily consumes a run in `rest`, and matches `suffix` there.
  `first` must be a subset of `rest`. On suffix failure it caches the run and
  suppresses attempts starting inside it for the rest of that document, until a
  later failure replaces the cache entry. All uses of a name must have the same
  sets and suffix. The suffix must have the same result at a fixed input
  position independently of prior attempts; violating that author obligation
  invalidates the optimization.
- `matchRun(runSlot, { relation })` fails if the run is unset. Otherwise it
  consumes the maximal document-local run of the saved byte and requires its
  length to be at least the saved length (the default), or exactly that length
  for `relation: "exact"`. It does not consume a prefix of a longer run in
  exact mode. `relation: "prefix"` consumes exactly the saved length, even
  when more of the saved byte follows, and fails if fewer bytes are available.
  `separatedRun(set, separators, min = 1)` selects the first byte
  from `set`, then greedily consumes that same byte and separator bytes,
  including trailing separators. It requires at least `min` occurrences of
  the selected byte; if a byte is both selected and a separator it counts as
  selected. `min` is in 1..2,147,483,647.
- `indentTo(columnSlot, { ancestor })` uses the current frame's saved column,
  or an ancestor frame (`1` is the immediate parent). An unset slot or missing
  ancestor fails. Starting at the match position, it consumes spaces and tabs
  until the physical column is at least the saved column, failing on another
  byte or the document end before reaching it. A tab can overshoot. If already at
  or beyond the target it succeeds without consuming. Columns reset on LF;
  tabs advance to the next multiple of four. Other characters advance one
  column, with UTF-8 continuation bytes not counted.
- `baseState(...names)` is a zero-width membership test of the state below the
  outermost speculative frame, or the current state without speculation.

Shell-specific matchers are namespaced under `shell`:

- `shell.captured()` matches the current capture's bytes, including an empty
  capture, or fails if it overflowed or the bytes do not fit or match before the
  document end.
- `shell.queueHas(mask = 0, flags = 0)` succeeds without consuming when the
  current owner's FIFO has a head and `(head.flags & mask) === flags`.
  `shell.queueText()` matches that head's captured bytes in this document and
  fails for an absent or overflowed head. `shell.queueFooter()` additionally
  requires the matched delimiter to contain no LF and be followed by LF or the
  document end; it leaves the LF unconsumed. This matcher starts at the current
  position; the indentation policy applies to the queue sweep, not this matcher.
- `shell.group()` recognizes document-local shell `$()`, `$(())`, `${}` and
  backtick groups, handling quotes and backslash escapes with the implementation's
  two-level nested-group bound. A newline, incomplete quoted or escaped portion,
  or missing closing delimiter makes the relevant attempt fail. This is a
  bounded delimiter recognizer, not a shell parser.

## Effects, slots, and classification

Effects execute in written order after the whole arm has matched. `paint(style)`
paints the matched bytes up to the match end; each ordinary arm has exactly one
paint. `setState(name)` replaces the current state. `pushState(name)` saves the
current state and its column slots and enters `name` with a copy of the columns.
`popState({ atRoot })` restores the saved state and columns; at the bottom it
uses `atRoot` if supplied, otherwise it does nothing. `resource()` explicitly
fails the call with resource status. Named states and slot handles are checked
at definition time.

`wrap(style)` records a non-empty group from the current frame's pushing arm through
the end of this arm; `wrap(style, { from: "arm" })` starts at this arm instead.
The effect is applied at the end of the arm regardless of effect order, flushes
the pending span, and does nothing when a frame is unwound or reaches EOF. At most
one wrap is allowed per arm or classification branch. The style must have a tag;
the frame form requires a pushed state that cannot be entered at the root. See [the ABI](abi.md) for group records and host semantics.

Create a handle once with `slot.run(name)`, `slot.range(name)`, or
`slot.column(name)`, then reuse that handle. Names are nonempty; distinct handles
of the same kind cannot share a name in one grammar. Different slot kinds may
share a name. A document start clears them.

```ts
const fence = slot.run("fence");
on("`", bytes("`", { min: 3 }), saveRun(fence), paint("punctuation.delimiter"));
on("`", matchRun(fence), paint("punctuation.delimiter"), popState());
```

- `saveRun(slot)` saves the final maximal run of equal bytes **within the
  complete matched arm**, for `matchRun`. Run slots are document-local by default.
  Declare `slot.run(name, { scope: "frame" })` for a slot inherited on push and
  restored on pop. Frame-scoped saves execute in order with stack effects: push
  before saving a nested delimiter to retain the parent's value.
  A grammar's `tabStop` (4 by default, or 8) sets where a tab advances the physical column
  for `saveColumn` and `indentTo`: CommonMark uses 4, Kconfig and Python use 8.

- Counter slots start at zero. `counterIncrement(slot)` saturates at 2,147,483,647;
  `counterDecrement(slot)` does nothing at zero, and `counterReset(slot)` sets zero.
  They are document-scoped by default; `slot.counter(name, { scope: "frame" })`
  inherits the value on push and restores it on pop. `counterZero(slot)` and
  `counterPositive(slot)` are zero-width assertions. Counter effects execute in
  written order after the complete arm matches.

A state may declare `slots: "shared"` to share its parent's frame-scoped run and
counter slots when pushed. Such a push does not save those slots, and popping the
frame does not restore them; changes persist in the owner. The option belongs to
the pushed frame: state replacement, redispatch, root-pop fallback, and queue
footer replacement must preserve shared versus owning status; a stale queue body
that would violate this rule fails as a resource error. For shared-slot
grammars, a state change after a pop is rejected when the validator cannot
determine the returned frame's ownership. Columns and other frame data retain
their ordinary behavior. Speculation still rolls slot changes back on abandonment.
For grammars using shared slots, a failed root-container prefix restores the first
owning frame's slots before resetting the state stack; grammars without shared
slots retain the existing root-reset behavior.

- `saveColumn(slot)` saves the physical column at the end of the complete
  matched arm. Columns are frame-local, inherited on push, restored on pop,
  and initially unset.
- `saveRange(slot)` saves the matched arm's `[start, end)` source offsets;
  `clearRange(slot)` unsets it. Ranges are document-local. An unset named
  injection range is represented by `[0, 0]`.
- `markRecord()` marks the span painted by this arm; `patchRecord(style)`
  changes the previously marked span's style, even if already published. No mark is a no-op. With these effects, the arm has one
  paint; at most one patch must precede it and at most one mark must follow it.

`classify(cases, otherwise)` compares the exact matched bytes to each case's
UTF-8 text and runs the first matching branch, or `otherwise`. With
`{ caseless: true }` as the third argument, case texts must be lowercase and
matching folds ASCII `A`–`Z` only; all other UTF-8 bytes compare exactly.
Duplicate encoded case texts are rejected. Classification must be the only effect of a consuming
arm with matchers. Every branch has exactly one paint and cannot contain another
classification, `speculate`, or `abandon`; record and injection ordering rules
also apply to branches. Classification is document-bounded because the arm's
match is. For example:

```ts
on(ident, bytes(ident), classify(keywordTable(["if", "else"], "keyword"), [paint("variable")]));
```

Shell effects operate on a document-local 256-byte capture and nested FIFO
owners. `shell.captureReset()` clears bytes, flags, and overflow;
`shell.captureAppend(skip = 0)` appends the matched arm's bytes, optionally
skipping its first byte; overflow makes subsequent capture and snapshot matches
fail until reset. `shell.captureMark(1)` sets the quoted flag.
`shell.queueEnter()` creates a nested owner, `shell.queueLeave()` discards it (leaving root is a no-op),
`shell.queueSave({ footerIndent })` appends a capture-and-flags snapshot to the
current FIFO with a per-entry indentation policy. `footerIndent` defaults to
`"none"`; `"tabs"` strips leading tabs on body lines and permits them before a
footer (Bash `<<-`), while `"whitespace"` permits spaces and tabs before a
footer without stripping ordinary body lines. `shell.queueHas` exposes the quoted
flag (mask 1), not the indentation policy. `shell.queueShift()` removes its head
if present, and `shell.queueOpen()` marks
its head as a live body at the current stack depth. Opening requires a configured
`queueSweep` and a head; otherwise execution fails as a resource error.

## Containers

A state with `prefix` is a container frame. Its opener consumes the first line's
marker. At each later physical line start, before the queue sweep and dispatch,
container frames are visited bottom-up. A matching prefix paints with the
prefix style and continues to the next frame. On failure, a `lazy` rule permits
that frame and every frame above it to continue unmarked if the top base-view
state is in `lazy.top` and `lazy.unless` fails. Otherwise the failing frame and
everything above it are closed. Prefix and lazy matches see the stack below
open speculation. A container prefix must have at least one matcher; it may
succeed without consuming.

```ts
prefix: {
  match: [bytes(" ", { min: 0, max: 3 }), literal(">"), optional(literal(" "))],
  style: "punctuation.special",
  lazy: { top: ["paragraph"], unless: [lookahead(...interrupters)] },
}
```

When any container exists in the grammar, a consuming arm or prefix fails if
its match contains LF anywhere except as its final byte. Assertions may inspect
later bytes. Frame-local columns make list indentation independent of nested
content state. Container failure can close a deeper injection; failure while
speculating first abandons the speculative attempt.

A configured shell `queueSweep` checks live heredoc bodies at physical line
starts after containers. It checks inner bodies first, emits configured tab
style for stripped leading tabs, recognizes a delimiter using the document-local
footer rule and the head's indentation policy, unwinds to the recorded depth and
enters its configured footer state. Under `"whitespace"`, the matched indentation
is included in the footer style; a non-footer line keeps its body styling. An
unquoted body joined by a preceding backslash-LF suppresses footer recognition
on the joined line. The sweep can close a deeper injection.

## Speculation

`speculate(state, group?, isolate?)` saves a checkpoint and enters a speculative
state. It may be used on a consuming, painting arm, or on a zero-width
`redispatch` arm alongside optional counter effects. The latter checkpoints
before the current byte and retries it in the new state; it counts toward the
consecutive-redispatch limit and cannot open an injection. A speculative opener must be the only stack action
in its arm. Nested speculation shares the normal `maxDepth` stack limit; at that
limit the opener is skipped and dispatch tries the next arm. An ordinary push
cannot enter a speculative state or occur inside one; speculation cannot coexist
in a grammar with shell capture or queues.
`popState` at the speculative frame commits it. `redispatch(set, abandon())`,
optionally preceded by the permitted zero-width assertions, abandons it;
`abandon` must be the only effect. An open attempt is also abandoned at the
document end. Abandon restores the checkpoint's position, state and stack,
columns, run and range slots, injection/output checkpoint, and replays from the
opener with the relevant opener group disabled over the failed interval.

By default the group is the target state; a supplied group shares failure
suppression among openers. `isolate: { base, group }` selects the alternate
group when the outermost attempt began in that base state. Nested attempts can
rewind an outer checkpoint instead of the innermost when the bounded rewind
ledger requires it. Thus an author must not depend on an unbounded backtracking
search or on speculative side effects being observable before commit.

```ts
on("[", literal("["), paint("punctuation.special"), speculate("link"));
redispatch("*", speculate("candidate")); // checkpoint before the current byte
redispatch("\n", abandon()); // in link: retry from its opener
```

## Injections and output

`openInjection({ static: language })` opens a statically named child;
`openInjection({ named: rangeSlot })` takes the language name from the saved
source range. On a consuming arm the open effect follows painting; on a
zero-width redispatch or effect-list fallback it opens at the current byte
before retrying it in the changed state. At most one injection is active in a
module at a time; opening another before closing is a resource failure. Subsequent painted bytes become child segments instead of parent style
spans. `hostPrefix()` before paint makes that arm's bytes a parent span while
keeping the child open. `closeInjection()` before paint ends the active child;
either operation without an active child is a resource failure. Only one of
open, close, or prefix may occur in an arm or classification branch. A
zero-width redispatch may also close an injection. The final child segment is marked
closed on close or document end; container or queue unwinding can also close it.
The host resolves and composes children; unknown language handling is a host
policy, not grammar matching.

````ts
const language = slot.range("language");
on("b", literal("bash"), saveRange(language), paint("label"), openInjection({ named: language }));
on("`", literal("```"), closeInjection(), paint("punctuation.delimiter"));
````

On success the records tile each document in order, with no record crossing
its end and no adjacent same-style parent spans within a document. A span gives
its end and style ID. An open gives a per-call injection ID and either a static
manifest embed index or a source name range; a child segment gives its end, ID,
and whether it closes. Opens precede their child segments. The host maps style
IDs and interprets named source ranges. See [the ABI](abi.md) for exact encoding,
style mapping, and composition.

## Limits and validation

The stack has at most 128 frames including the current one. More than 528
consecutive zero-width transitions is a resource failure. Nested shell owners
and live bodies are also bounded by 128. The capture capacity is 256 bytes;
overflow makes capture-dependent matches fail rather than itself failing the call. Injection
IDs have 29 bits. Scratch, output, and host memory limits can also cause a
resource failure. A compiled module returns resource status or traps with that
status; its records are valid only on success. A later call starts fresh, including after failure.

`defineGrammar` validates, among other things, initial and referenced states,
slot kind and identity, byte sets and bounds, cached-prefix consistency,
classification branches, redispatch and effect ordering, container references,
and speculation/queue restrictions. These checks do not prove that dispatch
sets cover an author's intent, that cached-prefix suffixes are stable, or that
the machine will avoid resource failure.
