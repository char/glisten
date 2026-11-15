import type { Arm, Effect, Grammar, Matcher, State } from "./mod.ts";
import {
  bytesOf,
  checkColumn,
  checkRunBounds,
  checkCharRanges,
  checkSeparatedRunMinimum,
} from "./bytes.ts";
import { indentTo, checkPrefixSets } from "./matchers.ts";
import type { WordEffect } from "./effects.ts";
import { slotBrand, type Slot, type RunSlot, type CounterSlot } from "./slots.ts";
import { styleTags } from "./styles.ts";
import { visitGrammar, visitMatchers, usesCapture, usesQueue } from "./analysis.ts";

type Kind = "run" | "counter" | "range" | "column";

type ValidationContext = { names: Set<string>; grammar: string; caches: Map<string, string> };

type EffectValidationContext = {
  names: Set<string>;
  grammar: string;
  state: string;
  speculativeStates: Set<string>;
  hasQueueSweep: boolean;
};

const zeroWidthAssertions = new Set<Matcher["kind"]>([
  "ahead",
  "notAhead",
  "notNext",
  "notBehind",
  "previousChar",
  "lineEnd",
  "columnAtLeast",
  "counterZero",
  "counterPositive",
]);

const counterEffects = new Set<Effect["kind"]>([
  "counterReset",
  "counterIncrement",
  "counterDecrement",
]);

const transitionEffects = new Set<Effect["kind"]>([
  "push",
  "pop",
  "goto",
  "speculate",
  "queueSave",
  "queueOpen",
  "closeInjection",
  "openStatic",
  "openNamed",
  "captureReset",
  "captureMark",
  "abandon",
]);

const requiresStackTransition = new Set<Effect["kind"]>([
  "captureReset",
  "captureMark",
  "openStatic",
  "openNamed",
]);

const effectKinds = {
  paint: true,
  markRecord: true,
  patchRecord: true,
  wrap: true,
  push: true,
  pop: true,
  goto: true,
  resource: true,
  captureRun: true,
  counterReset: true,
  counterIncrement: true,
  counterDecrement: true,
  captureColumn: true,
  saveRange: true,
  clearRange: true,
  openNamed: true,
  openStatic: true,
  hostPrefix: true,
  closeInjection: true,
  speculate: true,
  abandon: true,
  word: true,
  captureReset: true,
  captureAppend: true,
  captureMark: true,
  queueEnter: true,
  queueLeave: true,
  queueSave: true,
  queueShift: true,
  queueOpen: true,
} satisfies Record<Effect["kind"], true>;

export function isEffect(step: Matcher | Effect): step is Effect {
  return Object.hasOwn(effectKinds, step.kind);
}

function effectBranches(effects: readonly Effect[]): readonly (readonly Effect[])[] {
  const word = effects.find((effect) => effect.kind === "word");
  return word?.kind === "word"
    ? [...word.cases.map(({ then }) => then), word.otherwise]
    : [effects];
}

function checkMatcher(matcher: Matcher, context: ValidationContext): void {
  switch (matcher.kind) {
    case "one":
    case "notNext":
    case "notBehind":
      bytesOf(matcher.set);
      break;
    case "baseState":
      for (const name of matcher.states)
        if (!context.names.has(name))
          throw new Error(`${context.grammar}: unknown base state ${name}`);
      break;
    case "run":
      bytesOf(matcher.set);
      checkRunBounds(matcher.min, matcher.max);
      if (matcher.untilColumn !== undefined) checkColumn(matcher.untilColumn);
      break;
    case "cachedPrefix": {
      checkPrefixSets(matcher.first, matcher.rest);
      const definition = JSON.stringify([
        bytesOf(matcher.first),
        bytesOf(matcher.rest),
        matcher.suffix,
      ]);
      if (context.caches.has(matcher.name) && context.caches.get(matcher.name) !== definition)
        throw new Error(`Inconsistent cached prefix ${matcher.name}`);
      context.caches.set(matcher.name, definition);
      break;
    }
    case "previousChar":
      checkCharRanges(matcher.ranges);
      if (typeof matcher.invert !== "boolean")
        throw new TypeError("Invalid previous character polarity");
      break;
    case "columnAtLeast":
      checkColumn(matcher.column);
      break;
    case "separatedRun":
      bytesOf(matcher.set);
      bytesOf(matcher.separators);
      checkSeparatedRunMinimum(matcher.min);
      break;
    case "toColumn":
      indentTo(matcher.slot, { ancestor: matcher.ancestor });
      break;
  }
}

function checkEffect(effect: Effect, context: EffectValidationContext): void {
  switch (effect.kind) {
    case "push":
    case "pop":
    case "goto":
    case "speculate":
    case "abandon":
      checkStateEffect(effect, context);
      break;
    case "queueOpen":
      if (!context.hasQueueSweep)
        throw new Error(`${context.grammar}.${context.state}: queueOpen needs a queue sweep`);
      break;
  }
}

function checkSlots(grammar: Grammar): void {
  const seen = new Map<string, Slot<Kind>>();
  const check = (value: Slot<Kind>, kind: Kind) => {
    if (!value || typeof value !== "object" || value[slotBrand] !== true || value.kind !== kind)
      throw new Error(`${grammar.name}: expected a ${kind} slot handle`);
    if (
      (kind === "run" || kind === "counter") &&
      (value as RunSlot | CounterSlot).scope !== undefined &&
      (value as RunSlot | CounterSlot).scope !== "frame"
    )
      throw new Error(`${grammar.name}: invalid ${kind} slot scope`);
    const key = `${kind}:${value.name}`;
    const previous = seen.get(key);
    if (previous && previous !== value)
      throw new Error(`${grammar.name}: duplicate ${kind} slot ${value.name}`);
    seen.set(key, value);
  };
  const matcher = (item: Matcher) => {
    if (item.kind === "sameRun") check(item.slot, "run");
    if (item.kind === "counterZero" || item.kind === "counterPositive") check(item.slot, "counter");
    if (item.kind === "toColumn") check(item.slot, "column");
  };
  const effect = (item: Effect) => {
    if (item.kind === "captureRun") check(item.slot, "run");
    if (
      item.kind === "counterReset" ||
      item.kind === "counterIncrement" ||
      item.kind === "counterDecrement"
    )
      check(item.slot, "counter");
    if (item.kind === "captureColumn") check(item.slot, "column");
    if (item.kind === "saveRange" || item.kind === "clearRange" || item.kind === "openNamed")
      check(item.slot, "range");
  };
  visitGrammar(grammar, { matcher, effect });
}

export function checkArm(arm: Arm) {
  bytesOf(arm.on);

  const classification = arm.then.find((effect) => effect.kind === "word");
  const zeroWidthSpeculation =
    arm.redispatch && arm.then.some((effect) => effect.kind === "speculate");
  const paintCount = arm.then.filter((effect) => effect.kind === "paint").length;
  if (paintCount > 1) throw new Error("An arm must have exactly one paint");
  const paints = paintCount !== 0 || classification !== undefined;
  if (arm.redispatch ? paints : !paints)
    throw new Error(
      arm.redispatch ? "A redispatch cannot paint" : "A non-painting arm must use redispatch",
    );
  if (classification?.kind === "word") {
    checkWordArm(arm, classification);
  } else if (!paintCount) {
    const hasStackTransition = arm.then.some(
      (effect) => effect.kind === "push" || effect.kind === "pop" || effect.kind === "goto",
    );
    const hasNonAssertion = arm.match.some(
      (matcher) => matcher.kind !== "queueHas" && !zeroWidthAssertions.has(matcher.kind),
    );
    const hasInvalidEffect = arm.then.some(
      (effect) =>
        !transitionEffects.has(effect.kind) &&
        !(zeroWidthSpeculation && counterEffects.has(effect.kind)),
    );
    const missingStackTransition =
      !hasStackTransition && arm.then.some((effect) => requiresStackTransition.has(effect.kind));
    if (hasNonAssertion || arm.then.length === 0 || hasInvalidEffect || missingStackTransition)
      throw new Error("An arm must paint what it matches or be a zero-width transition");
  }

  if (!classification) checkRecordEffects(arm.then);
  checkSpeculationArm(arm);
  checkInjectionArm(arm);
}

function checkContainer(
  state: State,
  grammar: string,
  name: string,
  names: Set<string>,
  checkMatchers: (matcher: Matcher) => void,
): void {
  const prefix = state.prefix;
  if (!prefix) return;
  if (!prefix.match.length) throw new Error(`${grammar}.${name}: container prefix needs matchers`);
  prefix.match.forEach(checkMatchers);
  prefix.lazy?.unless.forEach(checkMatchers);
  for (const top of prefix.lazy?.top ?? [])
    if (!names.has(top)) throw new Error(`${grammar}.${name}: unknown lazy state ${top}`);
}

function checkWraps(grammar: Grammar): void {
  const pushed = new Set<string>();
  const root = new Set<string>([grammar.initial]);

  for (const state of Object.values<State>(grammar.states)) {
    const branches = state.arms.flatMap((arm) => effectBranches(arm.then));
    if (state.otherwise && typeof state.otherwise !== "string") branches.push(state.otherwise);
    for (const branch of branches) {
      let depth = 0;
      let returned = false;
      for (const effect of branch) {
        if (effect.kind === "push" || effect.kind === "speculate") {
          pushed.add(effect.state);
          depth++;
        } else if (effect.kind === "pop") {
          if (depth) depth--;
          else returned = true;
        } else if (effect.kind === "goto") {
          if (depth) pushed.add(effect.state);
          else if (returned) root.add(effect.state);
        }
      }
    }
  }

  // Replacements retain the current frame's origin. Propagate both origins through
  // zero-depth transitions before deciding whether a frame wrap has an opener.
  for (const frames of [root, pushed]) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const name of [...frames]) {
        const state = grammar.states[name];
        if (!state) continue;
        const targets: string[] = [];
        if (typeof state.otherwise === "string") targets.push(state.otherwise);
        const branches = state.arms.flatMap((arm) => effectBranches(arm.then));
        if (state.otherwise && typeof state.otherwise !== "string") branches.push(state.otherwise);
        for (const branch of branches) {
          let depth = 0;
          for (const effect of branch) {
            if (effect.kind === "push" || effect.kind === "speculate") depth++;
            if (effect.kind === "goto" && depth === 0) targets.push(effect.state);
            if (effect.kind === "pop") {
              if (depth) depth--;
              else if (frames === root && effect.fallback !== undefined)
                targets.push(effect.fallback);
            }
          }
        }
        for (const target of targets)
          if (!frames.has(target)) {
            frames.add(target);
            changed = true;
          }
      }
    }
  }

  for (const [name, state] of Object.entries<State>(grammar.states)) {
    for (const arm of state.arms)
      for (const branch of effectBranches(arm.then)) {
        const wraps = branch.filter((effect) => effect.kind === "wrap");
        if (wraps.length > 1) throw new Error(`${grammar.name}.${name}: at most one wrap per arm`);
        for (const effect of wraps) {
          if (!Object.hasOwn(styleTags, effect.style) || !styleTags[effect.style])
            throw new Error(`${grammar.name}.${name}: wrap style must have a tag`);
          if (effect.from !== "arm" && effect.from !== "frame")
            throw new Error(`${grammar.name}.${name}: invalid wrap origin`);
          if (effect.from === "frame" && (!pushed.has(name) || root.has(name)))
            throw new Error(`${grammar.name}.${name}: frame wrap requires a pushed state`);
        }
      }
  }
}

function checkRecordEffects(effects: readonly Effect[]) {
  if (!effects.some((effect) => effect.kind === "markRecord" || effect.kind === "patchRecord"))
    return;
  const paintPositions = effects.flatMap((effect, index) =>
    effect.kind === "paint" ? [index] : [],
  );
  const marks = effects.filter((effect) => effect.kind === "markRecord");
  const patches = effects.filter((effect) => effect.kind === "patchRecord");
  const paintIndex = paintPositions[0];
  if (
    paintPositions.length !== 1 ||
    paintIndex === undefined ||
    marks.length > 1 ||
    patches.length > 1 ||
    effects.some(
      (effect, index) =>
        (effect.kind === "markRecord" && index < paintIndex) ||
        (effect.kind === "patchRecord" && index > paintIndex),
    )
  )
    throw new Error("Record patch must precede the single paint and mark must follow it");
}

function checkWordArm(arm: Arm, classification: WordEffect): void {
  if (arm.then.length !== 1 || arm.match.length === 0)
    throw new Error("A word classification must be the only effect of a consuming arm");
  const keys = classification.cases.map(({ text }) =>
    [...new TextEncoder().encode(text)].join(","),
  );
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate word classification case");
  if (
    classification.caseless &&
    classification.cases.some(({ text }) => text !== text.toLowerCase())
  )
    throw new Error("Caseless word classification cases must be lowercase");
  for (const branch of [
    ...classification.cases.map(({ then }) => then),
    classification.otherwise,
  ]) {
    checkRecordEffects(branch);
    if (
      branch.filter((effect) => effect.kind === "paint").length !== 1 ||
      branch.some(
        (effect) =>
          effect.kind === "word" || effect.kind === "speculate" || effect.kind === "abandon",
      )
    )
      throw new Error(
        "Each word classification branch must have exactly one paint and no classification",
      );
  }
}

function checkInjectionArm(arm: Arm): void {
  for (const branch of effectBranches(arm.then)) {
    const paintIndex = branch.findIndex((effect) => effect.kind === "paint");
    const injectionEffects = branch.filter(
      (effect) =>
        effect.kind === "openNamed" ||
        effect.kind === "openStatic" ||
        effect.kind === "hostPrefix" ||
        effect.kind === "closeInjection",
    );
    const outOfOrder = branch.some((effect, index) => {
      if (effect.kind === "openNamed" || effect.kind === "openStatic") return index < paintIndex;
      if (effect.kind === "hostPrefix") return index > paintIndex;
      return effect.kind === "closeInjection" && paintIndex >= 0 && index > paintIndex;
    });
    if (injectionEffects.length > 1 || outOfOrder)
      throw new Error("Prefix and close injections before painting; open them after painting");
  }
}

function checkSpeculationArm(arm: Arm): void {
  const opens = arm.then.some((step) => step.kind === "speculate");
  const abandons = arm.then.some((step) => step.kind === "abandon");
  if (
    opens &&
    !arm.redispatch &&
    (arm.match.length === 0 || !arm.then.some((step) => step.kind === "paint"))
  )
    throw new Error("A speculative opener must consume and paint");
  if (
    arm.redispatch &&
    opens &&
    arm.then.some((step) => step.kind !== "speculate" && !counterEffects.has(step.kind))
  )
    throw new Error("A zero-width speculative opener permits only counter effects");
  if (
    abandons &&
    (arm.then.length !== 1 || arm.match.some((matcher) => !zeroWidthAssertions.has(matcher.kind)))
  )
    throw new Error("Abandon must be the sole effect of a zero-width arm");
}

function checkSpeculationEffects(effects: readonly Effect[], grammar: string, state: string): void {
  if (
    effects.some((effect) => effect.kind === "speculate") &&
    effects.filter(
      (effect) =>
        effect.kind === "speculate" ||
        effect.kind === "push" ||
        effect.kind === "pop" ||
        effect.kind === "goto",
    ).length !== 1
  )
    throw new Error(`${grammar}.${state}: a speculative opener must be the only stack action`);
}

function checkSpeculativeStates<Name extends string>(grammar: Grammar<Name>): Set<string> {
  const speculativeStates = new Set<string>();
  for (const state of Object.values<State>(grammar.states))
    for (const arm of state.arms)
      for (const effect of arm.then)
        if (effect.kind === "speculate") speculativeStates.add(effect.state);
  // Follow replacements until both sets reach a fixed point; nested openers may return
  // into an outer speculative frame before replacing it.
  const nestedStates = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const add = (set: Set<string>, name: string) => {
      if (!set.has(name)) {
        set.add(name);
        changed = true;
      }
    };
    for (const name of speculativeStates) {
      const state = grammar.states[name as Name];
      if (!state) continue;
      for (const arm of state.arms) {
        let popped = false;
        for (const effect of arm.then) {
          if (effect.kind === "pop") popped = true;
          if (effect.kind === "speculate") add(nestedStates, effect.state);
          if (effect.kind === "goto" && (!popped || nestedStates.has(name))) {
            add(speculativeStates, effect.state);
            if (nestedStates.has(name)) add(nestedStates, effect.state);
          }
        }
      }
    }
  }
  if (speculativeStates.size && (usesCapture(grammar) || usesQueue(grammar)))
    throw new Error(
      `${grammar.name}: speculation cannot be combined with heredoc queues or captures`,
    );
  if (speculativeStates.has(grammar.initial))
    throw new Error(`${grammar.name}: the root cannot be a speculative state`);
  return speculativeStates;
}

function checkStateEffect(effect: Effect, context: EffectValidationContext): void {
  const { grammar, state: name, names, speculativeStates } = context;
  const insideSpeculation = speculativeStates.has(name);
  if (insideSpeculation && effect.kind === "push")
    throw new Error(`${grammar}.${name}: ordinary pushes inside speculation are not supported`);
  if (!insideSpeculation && effect.kind === "abandon")
    throw new Error(`${grammar}.${name}: abandon requires a speculative state`);
  if (
    (effect.kind === "push" || (effect.kind === "goto" && !insideSpeculation)) &&
    speculativeStates.has(effect.state)
  )
    throw new Error(`${grammar}.${name}: speculative states require a speculative opener`);
  if (
    (effect.kind === "push" || effect.kind === "goto" || effect.kind === "speculate") &&
    !names.has(effect.state)
  )
    throw new Error(`${grammar}.${name}: unknown state ${effect.state}`);
  if (effect.kind === "pop" && effect.fallback !== undefined && !names.has(effect.fallback))
    throw new Error(`${grammar}.${name}: unknown state ${effect.fallback}`);
  if (effect.kind === "speculate" && effect.isolate && !names.has(effect.isolate.base))
    throw new Error(`${grammar}.${name}: unknown speculation base state ${effect.isolate.base}`);
}

function checkSlotTransitions(grammar: Grammar, name: string, effects: readonly Effect[]): void {
  type Ownership = "shared" | "owning";
  const ownershipOf = (state: string): Ownership =>
    grammar.states[state]?.slots === "shared" ? "shared" : "owning";
  const ownership = new Set(Object.keys(grammar.states).map(ownershipOf));
  // A pop to an unknown caller is still unambiguous if every state has the same ownership.
  const returned = ownership.size === 1 ? ownership.values().next().value : undefined;
  let current: Ownership | undefined = ownershipOf(name);
  const pushed: (Ownership | undefined)[] = [];
  const checkReplacement = (target: string) => {
    if (current === undefined)
      throw new Error(
        `${grammar.name}.${name}: cannot determine slot ownership after pop before changing state`,
      );
    if (current !== ownershipOf(target))
      throw new Error(
        `${grammar.name}.${name}: state change cannot cross shared and owning slot frames`,
      );
  };
  for (const effect of effects) {
    if (effect.kind === "push" || effect.kind === "speculate") {
      pushed.push(current);
      current = ownershipOf(effect.state);
    } else if (effect.kind === "pop") {
      if (!pushed.length && effect.fallback !== undefined) checkReplacement(effect.fallback);
      current = pushed.length ? pushed.pop() : returned;
    } else if (effect.kind === "goto") {
      checkReplacement(effect.state);
      current = ownershipOf(effect.state);
    } else if (effect.kind === "queueOpen" && grammar.queueSweep) {
      checkReplacement(grammar.queueSweep.footer);
    }
  }
}

function checkZeroWidthOpen(effects: readonly Effect[], grammar: string, name: string): void {
  const opens = effects.filter(
    (effect) => effect.kind === "openStatic" || effect.kind === "openNamed",
  );
  if (!opens.length) return;
  const transitions = effects.filter(
    (effect) => effect.kind === "push" || effect.kind === "pop" || effect.kind === "goto",
  );
  const change = transitions[0];
  if (
    opens.length !== 1 ||
    transitions.length !== 1 ||
    !change ||
    (change.kind === "pop"
      ? change.fallback === undefined || change.fallback === name
      : change.state === name)
  )
    throw new Error(
      `${grammar}.${name}: a zero-width injection open needs exactly one state change`,
    );
}

function checkFallback(
  state: State,
  grammar: string,
  name: string,
  names: Set<string>,
  speculativeStates: Set<string>,
): void {
  if (typeof state.otherwise === "string" && speculativeStates.has(state.otherwise))
    throw new Error(`${grammar}.${name}: speculative states require a speculative opener`);
  if (speculativeStates.has(name) && state.otherwise !== undefined)
    throw new Error(`${grammar}.${name}: a speculative state cannot replace itself`);
  if (typeof state.otherwise === "string" && !names.has(state.otherwise))
    throw new Error(`${grammar}.${name}: unknown state ${state.otherwise}`);
  if (state.otherwise && typeof state.otherwise !== "string") {
    if (
      !state.otherwise.length ||
      state.otherwise.some(
        (effect) =>
          effect.kind !== "push" &&
          effect.kind !== "pop" &&
          effect.kind !== "goto" &&
          effect.kind !== "openStatic" &&
          effect.kind !== "openNamed",
      )
    )
      throw new Error("A fallback transition needs only stack effects");
    checkZeroWidthOpen(state.otherwise, grammar, name);
    for (const effect of state.otherwise) {
      if ((effect.kind === "push" || effect.kind === "goto") && !names.has(effect.state))
        throw new Error(`${grammar}.${name}: unknown state ${effect.state}`);
      if (effect.kind === "pop" && effect.fallback !== undefined && !names.has(effect.fallback))
        throw new Error(`${grammar}.${name}: unknown state ${effect.fallback}`);
    }
  }
}

export function checkGrammar<Name extends string>(grammar: Grammar<Name>): void {
  const names = new Set<string>(Object.keys(grammar.states));
  if (!names.size) throw new Error(`${grammar.name}: a grammar needs a state`);
  if (!names.has(grammar.initial))
    throw new Error(`${grammar.name}: unknown initial state ${grammar.initial}`);

  checkSlots(grammar);
  checkWraps(grammar);
  const speculativeStates = checkSpeculativeStates(grammar);
  if (grammar.queueSweep && !names.has(grammar.queueSweep.footer))
    throw new Error(`${grammar.name}: unknown queue footer state ${grammar.queueSweep.footer}`);

  const hasSharedStates = Object.values<State>(grammar.states).some(
    (state) => state.slots === "shared",
  );
  const caches = new Map<string, string>();
  const checkMatchers = (root: Matcher, allowedColumn?: Matcher) =>
    visitMatchers([root], (matcher) => {
      if (matcher.kind === "columnAtLeast" && matcher !== allowedColumn)
        throw new Error(
          "columnAtLeast is only valid as the first matcher of an arm, where the physical column is current",
        );
      checkMatcher(matcher, { names, grammar: grammar.name, caches });
    });

  for (const [name, state] of Object.entries<State>(grammar.states)) {
    if (state.slots !== undefined && state.slots !== "shared")
      throw new Error(`${grammar.name}.${name}: invalid slot sharing option`);
    checkContainer(state, grammar.name, name, names, checkMatchers);
    checkFallback(state, grammar.name, name, names, speculativeStates);
    if (hasSharedStates && state.otherwise !== undefined) {
      const effects: readonly Effect[] =
        typeof state.otherwise === "string"
          ? [{ kind: "goto", state: state.otherwise }]
          : state.otherwise;
      checkSlotTransitions(grammar, name, effects);
    }

    for (const arm of state.arms) {
      arm.match.forEach((matcher, index) =>
        checkMatchers(
          matcher,
          index === 0 && matcher.kind === "columnAtLeast" ? matcher : undefined,
        ),
      );
      checkArm(arm);
      if (arm.redispatch) checkZeroWidthOpen(arm.then, grammar.name, name);
      const branches = effectBranches(arm.then);
      const effects = branches.flat();
      checkSpeculationEffects(effects, grammar.name, name);
      for (const effect of effects)
        checkEffect(effect, {
          names,
          grammar: grammar.name,
          state: name,
          speculativeStates,
          hasQueueSweep: !!grammar.queueSweep,
        });
      if (hasSharedStates)
        for (const branch of branches) checkSlotTransitions(grammar, name, branch);
    }
  }
}
