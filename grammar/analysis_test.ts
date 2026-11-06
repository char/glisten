import { test } from "avril:test";
import {
  lookahead,
  baseState,
  cachedPrefix,
  saveColumn,
  saveRun,
  defineGrammar,
  choice,
  lineEnd,
  literal,
  notLookahead,
  on,
  optional,
  paint,
  popState,
  repeat,
  matchRun,
  saveRange,
  indentTo,
  classify,
  shell,
  openInjection,
  slot,
} from "./mod.ts";
import { analyzeGrammar } from "./analysis.ts";
import { usesCapture } from "./capture.ts";
import { usesQueue } from "./queue.ts";
import { someMatcher, visitGrammar, visitMatchers } from "./visit.ts";
import { equal, throws } from "#/testing/assert.ts";

const prefixColumnSlot = slot.column("prefix");
const lazyColumnSlot = slot.column("lazy");
const firstRunSlot = slot.run("first");
const innerColumnSlot = slot.column("inner");
const secondRunSlot = slot.run("second");
const effectColumnSlot = slot.column("effect");
const nameRangeSlot = slot.range("name");
const nestedRunSlot = slot.run("nested");
const cColumnSlot = slot.column("c");

const grammar = defineGrammar({
  initial: "root",
  name: "analysis",
  states: {
    root: {
      style: "comment",
      prefix: {
        match: [indentTo(prefixColumnSlot)],
        style: "label",
        lazy: {
          top: ["root"],
          unless: [notLookahead(repeat(indentTo(lazyColumnSlot)), lineEnd(), shell.queueHas())],
        },
      },
      arms: [
        on(
          "a",
          choice(
            [literal("a"), repeat(matchRun(firstRunSlot))],
            [optional(indentTo(innerColumnSlot))],
          ),
          lookahead(shell.captured()),
          classify(
            [
              {
                text: "a",
                then: [
                  saveRun(secondRunSlot),
                  saveColumn(effectColumnSlot),
                  paint("keyword"),
                  openInjection({ static: "child" }),
                ],
              },
            ],
            [saveRange(nameRangeSlot), paint("string"), openInjection({ named: nameRangeSlot })],
          ),
        ),
      ],
    },
    child: { style: "comment", arms: [], otherwise: [popState()] },
  },
});

test("grammar analysis visits nested matchers and word effects in first-use order", () => {
  const analysis = analyzeGrammar(grammar);
  equal(analysis.styles, ["plain", "comment", "label", "keyword", "string"]);
  equal(analysis.embeds, ["child"]);
  equal(analysis.columns, ["prefix", "lazy", "inner", "effect"]);
  equal(
    [...analysis.runs],
    [
      ["first", 0],
      ["second", 1],
    ],
  );
  equal([...analysis.ranges], [["name", 0]]);
  equal(analysis.injections, true);
  equal(usesCapture(grammar), true);
  equal(usesQueue(grammar), true);
  const effects: string[] = [];
  visitGrammar(grammar, { effect: (effect) => effects.push(effect.kind) });
  equal(effects, [
    "word",
    "captureRun",
    "captureColumn",
    "paint",
    "openStatic",
    "saveRange",
    "paint",
    "openNamed",
    "pop",
  ]);
});

test("nested matcher validation checks state references and cached-prefix consistency", () => {
  throws(
    () =>
      defineGrammar({
        initial: "root",
        name: "bad",
        states: {
          root: {
            style: "plain",
            arms: [
              on("a", lookahead(optional(baseState("missing"))), literal("a"), paint("plain")),
            ],
          },
        },
      }),
    Error,
    /unknown base state missing/,
  );
  throws(
    () =>
      defineGrammar({
        initial: "root",
        name: "bad",
        states: {
          root: {
            style: "plain",
            arms: [
              on(
                "a",
                choice(
                  [cachedPrefix("x", "a", "a", literal("!"))],
                  [notLookahead(cachedPrefix("x", "a", "a", literal("?")))],
                ),
                paint("plain"),
              ),
            ],
          },
        },
      }),
    Error,
    /Inconsistent cached prefix x/,
  );
});

test("matcher traversal descends through assertions and permits pruning", () => {
  const matchers = [
    choice(
      [literal("a"), notLookahead(repeat(matchRun(nestedRunSlot)))],
      [optional(indentTo(cColumnSlot))],
    ),
  ];
  const kinds: string[] = [];
  visitMatchers(matchers, (matcher) => {
    kinds.push(matcher.kind);
  });
  equal(kinds, ["either", "literal", "notAhead", "repeat", "sameRun", "opt", "toColumn"]);
  equal(
    someMatcher(matchers, (matcher) => matcher.kind === "sameRun"),
    true,
  );
  const pruned: string[] = [];
  visitMatchers(matchers, (matcher) => {
    pruned.push(matcher.kind);
    return matcher.kind !== "notAhead";
  });
  equal(pruned, ["either", "literal", "notAhead", "opt", "toColumn"]);
  const postorder: string[] = [];
  visitMatchers(
    matchers,
    (matcher) => matcher.kind !== "notAhead",
    (matcher) => {
      postorder.push(matcher.kind);
    },
  );
  equal(postorder, ["literal", "notAhead", "toColumn", "opt", "either"]);
});
