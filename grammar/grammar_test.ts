import { test } from "avril:test";
import { equal, throws } from "#/testing/assert.ts";
import {
  bytes,
  classify,
  columnAtLeast,
  counterIncrement,
  counterReset,
  counterZero,
  defineGrammar,
  indentTo,
  literal,
  lookahead,
  markRecord,
  matchRun,
  notNext,
  on,
  openInjection,
  paint,
  patchRecord,
  popState,
  pushState,
  redispatch,
  saveRun,
  setState,
  shell,
  slot,
  type Arm,
  type Effect,
  type Matcher,
  type State,
} from "./mod.ts";

const grammarWith = (matcher: Matcher) =>
  defineGrammar({
    name: "validation",
    initial: "root",
    states: { root: { style: "plain", arms: [on("x", matcher, paint("plain"))] } },
  });

test("definition checks raw and nested matcher bounds and byte sets", () => {
  throws(() => grammarWith({ kind: "run", set: "x", min: -1 }), RangeError);
  throws(() => grammarWith({ kind: "run", set: "x", min: 2, max: 1 }), RangeError);
  throws(
    () => grammarWith({ kind: "separatedRun", set: "x", separators: " ", min: 0 }),
    RangeError,
  );
  throws(
    () => grammarWith({ kind: "toColumn", slot: slot.column("indent"), ancestor: -1 }),
    RangeError,
  );
  throws(
    () => grammarWith({ kind: "opt", matchers: [{ kind: "one", set: { bytes: [256] } }] }),
    RangeError,
  );
  throws(() => on({ bytes: [256] }, paint("plain")), RangeError);
});

test("definition checks root pop targets in arms and fallback effects", () => {
  throws(
    () =>
      defineGrammar({
        name: "missing-arm-target",
        initial: "root",
        states: {
          root: {
            style: "plain",
            arms: [on("x", paint("plain"), popState({ atRoot: "missing" }))],
          },
        },
      }),
    Error,
    /unknown state missing/,
  );

  throws(
    () =>
      defineGrammar({
        name: "missing-fallback-target",
        initial: "root",
        states: {
          root: { style: "plain", arms: [], otherwise: [popState({ atRoot: "missing" })] },
        },
      }),
    Error,
    /unknown state missing/,
  );
});

test("state slot sharing accepts only the shared option", () => {
  defineGrammar({
    name: "shared",
    initial: "root",
    states: { root: { style: "plain", arms: [], slots: "shared" } },
  });

  const invalid = { style: "plain" as const, arms: [], slots: "other" };
  throws(
    () =>
      defineGrammar({
        name: "invalid-sharing",
        initial: "root",
        states: { root: invalid as unknown as State },
      }),
    Error,
    /invalid slot sharing option/,
  );
});

test("state replacement preserves frame slot ownership", () => {
  const make = (arm: Arm, otherwise?: string | readonly Effect[]) =>
    defineGrammar({
      name: "ownership",
      initial: "root",
      states: {
        root: { style: "plain", arms: [arm], otherwise },
        shared: { slots: "shared", style: "plain", arms: [] },
        owner: { style: "plain", arms: [] },
      },
    });

  const message = /cannot cross shared and owning/;
  throws(() => make(on("x", literal("x"), paint("plain"), setState("shared"))), Error, message);
  throws(() => make(redispatch("x", setState("shared"))), Error, message);
  throws(() => make(on("x", literal("x"), paint("plain")), "shared"), Error, message);
  throws(
    () =>
      defineGrammar({
        name: "empty-state-target",
        initial: "root",
        states: {
          root: { style: "plain", arms: [], otherwise: "" },
          "": { slots: "shared", style: "plain", arms: [] },
        },
      }),
    Error,
    message,
  );
  throws(() => make(on("x", literal("x"), paint("plain")), [setState("shared")]), Error, message);
  throws(
    () => make(on("x", literal("x"), paint("plain"), pushState("shared"), setState("owner"))),
    Error,
    message,
  );
  throws(
    () =>
      make(
        on(
          "x",
          literal("x"),
          classify([{ text: "x", then: [paint("plain"), setState("shared")] }], [paint("plain")]),
        ),
      ),
    Error,
    message,
  );
  throws(
    () => make(on("x", literal("x"), paint("plain"), popState({ atRoot: "shared" }))),
    Error,
    message,
  );
  make(on("x", literal("x"), paint("plain"), pushState("shared"), popState(), setState("owner")));
  throws(
    () => make(on("x", literal("x"), paint("plain"), popState(), setState("owner"))),
    Error,
    /cannot determine slot ownership after pop/,
  );
});

test("queue footers preserve the opened frame's slot ownership", () => {
  throws(
    () =>
      defineGrammar({
        name: "ownership-queue",
        initial: "root",
        queueSweep: { footer: "root", footerStyle: "plain", tabStyle: "plain" },
        states: {
          root: {
            style: "plain",
            arms: [on("x", literal("x"), paint("plain"), pushState("shared"), shell.queueOpen())],
          },
          shared: { slots: "shared", style: "plain", arms: [] },
        },
      }),
    Error,
    /cannot cross shared and owning/,
  );
});

test("an arm cannot paint more than once", () => {
  throws(() => on("x", paint("plain"), paint("keyword")), Error, /exactly one paint/);
});

test("record patches precede painting and marks follow it", () => {
  on("x", literal("x"), patchRecord("keyword"), paint("plain"), markRecord());

  throws(() => on("x", literal("x"), markRecord(), paint("plain")), Error, /Record patch/);
  throws(
    () => on("x", literal("x"), paint("plain"), patchRecord("keyword")),
    Error,
    /Record patch/,
  );
  throws(
    () => on("x", literal("x"), paint("plain"), markRecord(), markRecord()),
    Error,
    /Record patch/,
  );
});

test("redispatch permits assertions and transitions but not consuming matchers", () => {
  redispatch("x", notNext("y"), setState("next"));
  throws(() => redispatch("x", literal("x"), setState("next")), Error, /zero-width transition/);
  throws(() => redispatch("x", shell.captureReset()), Error, /zero-width transition/);
  redispatch("x", shell.captureReset(), setState("next"));
});

test("run slot scope is opt-in and rejects unknown scopes", () => {
  equal(slot.run("document").scope, undefined);
  equal(slot.run("frame", { scope: "frame" }).scope, "frame");
  throws(() => slot.run("bad", { scope: "invalid" as "frame" }), Error, /scope/);
});

test("counter slot scope is opt-in and rejects unknown scopes", () => {
  equal(slot.counter("document").scope, undefined);
  equal(slot.counter("frame", { scope: "frame" }).scope, "frame");
  throws(() => slot.counter("bad", { scope: "invalid" as "frame" }), Error, /scope/);
});

test("slot handles are distinct by declaration and kind", () => {
  const first = slot.run("delimiter");
  const second = slot.run("delimiter");
  throws(
    () =>
      defineGrammar({
        name: "duplicate-slots",
        initial: "root",
        states: {
          root: {
            style: "plain",
            arms: [
              on("a", literal("a"), paint("plain"), saveRun(first)),
              on("b", matchRun(second), paint("plain")),
            ],
          },
        },
      }),
    Error,
    /duplicate run slot delimiter/,
  );

  defineGrammar({
    name: "distinct-kinds",
    initial: "root",
    states: {
      root: {
        style: "plain",
        arms: [
          on("a", literal("a"), paint("plain"), saveRun(first)),
          on(" ", indentTo(slot.column("delimiter")), paint("plain")),
        ],
      },
    },
  });
});

test("definition rejects a slot of the wrong kind", () => {
  const range = slot.range("name");
  // @ts-expect-error Range handles cannot be used as run handles.
  const wrong = saveRun(range);
  throws(
    () =>
      defineGrammar({
        name: "wrong-slot",
        initial: "root",
        states: {
          root: { style: "plain", arms: [on("a", literal("a"), paint("plain"), wrong)] },
        },
      }),
    Error,
    /expected a run slot handle/,
  );

  // @ts-expect-error Named injections require a range handle.
  openInjection({ named: slot.run("name") });
});

test("physical column matchers reject invalid bounds", () => {
  for (const n of [-1, 1.5, Infinity, 2147483648]) {
    throws(() => columnAtLeast(n), Error, /column/i);
    throws(() => bytes("x", { untilColumn: n }), Error, /column/i);
  }

  columnAtLeast(0);
  bytes("x", { untilColumn: 2147483647 });
});

test("column assertions are only permitted at an arm start", () => {
  const grammar = (arm: Arm) =>
    defineGrammar({
      name: "column-validation",
      initial: "s",
      states: { s: { style: "plain", arms: [arm] } },
    });

  throws(
    () => grammar(on("x", literal("x"), columnAtLeast(1), paint("plain"))),
    Error,
    /only valid as the first matcher/,
  );
  throws(
    () => grammar(on("x", lookahead(columnAtLeast(1)), literal("x"), paint("plain"))),
    Error,
    /only valid as the first matcher/,
  );

  grammar(on("x", columnAtLeast(1), literal("x"), paint("plain")));
  defineGrammar({
    name: "column-redispatch",
    initial: "s",
    states: {
      s: { style: "plain", arms: [redispatch("x", columnAtLeast(1), setState("t"))] },
      t: { style: "plain", arms: [] },
    },
  });
});

test("counter slots are checked through nested matchers and effects", () => {
  const one = slot.counter("cells");
  const two = slot.counter("cells");
  throws(
    () =>
      defineGrammar({
        name: "duplicate",
        initial: "root",
        states: {
          root: {
            style: "plain",
            arms: [
              on("a", lookahead(counterZero(one)), literal("a"), paint("plain"), counterReset(two)),
            ],
          },
        },
      }),
    Error,
    /duplicate counter slot cells/,
  );

  // @ts-expect-error A run slot is not a counter.
  const wrong = counterIncrement(slot.run("cells"));
  throws(
    () =>
      defineGrammar({
        name: "wrong",
        initial: "root",
        states: { root: { style: "plain", arms: [on("a", literal("a"), paint("plain"), wrong)] } },
      }),
    Error,
    /expected a counter slot handle/,
  );
});
