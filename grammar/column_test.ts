import { test } from "avril:test";
import {
  bytes,
  columnAtLeast,
  defineGrammar,
  literal,
  lookahead,
  on,
  paint,
  redispatch,
  setState,
} from "./mod.ts";
import { throws } from "#/testing/assert.ts";

test("physical column matchers reject invalid bounds", () => {
  for (const n of [-1, 1.5, Infinity, 2147483648]) {
    throws(() => columnAtLeast(n), Error, /column/i);
    throws(() => bytes("x", { untilColumn: n }), Error, /column/i);
  }
  columnAtLeast(0);
  bytes("x", { untilColumn: 2147483647 });
});

test("column assertions are only permitted at an arm start", () => {
  const grammar = (arm: ReturnType<typeof on>) =>
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
