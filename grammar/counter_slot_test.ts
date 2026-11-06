import { test } from "avril:test";
import { compile } from "#/compiler/mod.ts";
import { throws } from "#/testing/assert.ts";
import {
  counterDecrement,
  counterIncrement,
  counterPositive,
  counterReset,
  counterZero,
  defineGrammar,
  literal,
  lookahead,
  on,
  paint,
  redispatch,
  setState,
  slot,
} from "./mod.ts";

const counter = slot.counter("cells", { scope: "frame" });
const grammar = defineGrammar({
  name: "counter",
  initial: "root",
  states: {
    root: {
      style: "plain",
      arms: [
        on("a", counterZero(counter), literal("a"), paint("plain"), counterIncrement(counter)),
        on("b", counterPositive(counter), literal("b"), paint("plain"), counterDecrement(counter)),
        on("c", literal("c"), paint("plain"), counterReset(counter)),
        redispatch("d", counterZero(counter), setState("other")),
      ],
    },
    other: { style: "plain", arms: [] },
  },
});

test("counter grammar validates and compiles", () => {
  compile(grammar);
});

test("compiler accepts each counter operation independently", () => {
  const arms = [
    on("a", counterZero(counter), literal("a"), paint("plain")),
    on("a", counterPositive(counter), literal("a"), paint("plain")),
    on("a", literal("a"), paint("plain"), counterReset(counter)),
    on("a", literal("a"), paint("plain"), counterIncrement(counter)),
    on("a", literal("a"), paint("plain"), counterDecrement(counter)),
  ];
  for (const arm of arms) {
    const single = defineGrammar({
      name: "counter-single",
      initial: "root",
      states: { root: { style: "plain", arms: [arm] } },
    });
    compile(single);
  }
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
