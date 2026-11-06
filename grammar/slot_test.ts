import { test } from "avril:test";
import {
  defineGrammar,
  indentTo,
  literal,
  matchRun,
  on,
  openInjection,
  paint,
  saveRun,
  slot,
} from "./mod.ts";
import { throws } from "#/testing/assert.ts";

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
