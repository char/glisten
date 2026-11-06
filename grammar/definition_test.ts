import { test } from "avril:test";
import {
  classify,
  defineGrammar,
  literal,
  on,
  paint,
  popState,
  pushState,
  redispatch,
  setState,
  shell,
  slot,
  type Arm,
  type Matcher,
} from "./mod.ts";
import { throws } from "#/testing/assert.ts";

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
        states: { root: invalid as unknown as import("./mod.ts").State },
      }),
    Error,
    /invalid slot sharing option/,
  );
});

test("state replacement preserves frame slot ownership", () => {
  const make = (arm: Arm, otherwise?: string | readonly import("./mod.ts").Effect[]) =>
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
