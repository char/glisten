import { test } from "avril:test";
import { defineGrammar, on, paint, popState, slot, type Matcher } from "./mod.ts";
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

test("an arm cannot paint more than once", () => {
  throws(() => on("x", paint("plain"), paint("keyword")), Error, /exactly one paint/);
});
