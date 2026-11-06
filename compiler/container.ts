import type { Grammar, Matcher, State } from "#/grammar/mod.ts";
import { lineBoundaryCheck } from "./line_boundary.ts";
import type { speculationCode } from "./speculation_codegen.ts";

type ContainerContext = {
  states: State[];
  names: string[];
  grammar: Grammar;
  styles: string[];
  columns: string[];
  runSlots: Map<string, number>;
  frameBytes: number;
  framesOffset: number;
  frameAddress: string;
  hasSpeculation: boolean;
  hasInjections: boolean;
  spec: ReturnType<typeof speculationCode>;
  fresh: (hint: string) => string;
  matcher: (matcher: Matcher, fail: string) => string;
};

export function containerCode(context: ContainerContext): string {
  const {
    states,
    names,
    grammar,
    styles,
    columns,
    runSlots,
    frameBytes,
    framesOffset,
    frameAddress,
    hasSpeculation,
    hasInjections,
    spec,
    fresh,
    matcher,
  } = context;
  const frameAt = (index: string) =>
    `(i32.add (global.get $base) (i32.mul ${index} (i32.const ${frameBytes})))`;
  const saved = [
    ...columns.map((_, i) => `(local.set $containerColumn${i} (local.get $columnSlot${i}))`),
    ...[...runSlots.values()].flatMap((i) => [
      `(local.set $containerRunByte${i} (local.get $runByte${i}))`,
      `(local.set $containerRunLength${i} (local.get $runLength${i}))`,
    ]),
  ].join(" ");
  const restore = [
    `(local.set $depth (local.get $containerDepth))`,
    ...columns.map((_, i) => `(local.set $columnSlot${i} (local.get $containerColumn${i}))`),
    ...[...runSlots.values()].flatMap((i) => [
      `(local.set $runByte${i} (local.get $containerRunByte${i}))`,
      `(local.set $runLength${i} (local.get $containerRunLength${i}))`,
    ]),
  ].join(" ");
  const view = (index: string) =>
    [
      `(local.set $depth ${index})`,
      ...columns.map(
        (
          _,
          i,
        ) => `(local.set $columnSlot${i} (if (result i64) (i32.lt_u ${index} (local.get $containerBaseDepth))
        (then (i64.load offset=${framesOffset + 4 + i * 8} ${frameAt(index)}))
        (else ${hasSpeculation ? `(if (result i64) (local.get $specOpen) (then ${spec.outerField(`columnSlot${i}`)}) (else (local.get $containerColumn${i})))` : `(local.get $containerColumn${i})`})))`,
      ),
      ...[...runSlots.values()].flatMap((i) =>
        hasSpeculation
          ? [
              `(if (local.get $specOpen) (then (local.set $runByte${i} ${spec.outerField(`runByte${i}`)}) (local.set $runLength${i} ${spec.outerField(`runLength${i}`)})))`,
            ]
          : [],
      ),
    ].join(" ");
  const attempt = (items: readonly Matcher[], limitLine: boolean) => {
    const miss = fresh("containerMiss");
    return `(local.set $containerMatched (i32.const 0)) (local.set $p (local.get $pos))
        (block ${miss} ${items.map((item) => matcher(item, miss)).join(" ")}
          ${limitLine ? lineBoundaryCheck(items, miss) : ""}
          (local.set $containerMatched (i32.const 1)))`;
  };
  const cases = states
    .map((state, i) => {
      const prefix = state.prefix;
      if (!prefix) return "";
      const lazy = prefix.lazy;
      const top =
        lazy?.top
          .map(
            (name) => `(i32.eq (local.get $containerBaseState) (i32.const ${names.indexOf(name)}))`,
          )
          .reduce((a, b) => `(i32.or ${a} ${b})`, "(i32.const 0)") ?? "(i32.const 0)";
      return `(if (i32.eq (local.get $containerFrameState) (i32.const ${i})) (then
        ${view("(local.get $containerIndex)")}
        ${attempt(prefix.match, true)}
        ${restore}
        (if (local.get $containerMatched) (then
          (if (i32.gt_u (local.get $p) (local.get $pos)) (then
            (local.set $containerNext (i32.add (local.get $containerIndex) (i32.const 1)))
            (local.set $next (local.get $p)) (local.set $style (i32.const ${styles.indexOf(prefix.style)}))
            ${hasInjections ? "(local.set $parentPaint (i32.const 1)) (local.set $hostCurrent (i32.const -1))" : ""}
            ${grammar.queueSweep ? "(local.set $recheck (i32.const 1))" : ""}
            (br $paint)))
          (br $containerContinue)))
        ${lazy ? `(if ${top} (then ${view("(local.get $containerBaseDepth)")} ${attempt(lazy.unless, false)} ${restore} (br_if $containerDone (i32.eqz (local.get $containerMatched)))))` : ""}
        ${hasSpeculation ? `(if (local.get $specOpen) (then ${spec.rewind} (br $token)))` : ""}
        (if (local.get $containerIndex) (then
          (local.set $depth (i32.sub (local.get $containerIndex) (i32.const 1)))
          (local.set $state (i32.load offset=${framesOffset} ${frameAddress}))
          ${columns.map((_, slot) => `(local.set $columnSlot${slot} (i64.load offset=${framesOffset + 4 + slot * 8} ${frameAddress}))`).join(" ")})
          (else (local.set $state (i32.const ${names.indexOf(grammar.initial)})) (local.set $depth (i32.const 0))))
        ${hasInjections ? `(if (i32.and (local.get $host) (i32.gt_u (local.get $hostDepth) (local.get $depth))) (then (call $sealHost (local.get $hostLast)) (local.set $host (i32.const 0)) (local.set $hostCurrent (i32.const -1))))` : ""}
        (local.set $containerOpen (call $findContainer (local.get $depth) (local.get $state)))
        (br $containerDone)))`;
    })
    .join(" ");
  return `(if (i32.or (local.get $containerLine) (i32.ge_s (local.get $containerNext) (i32.const 0))) (then
      (local.set $containerDepth (local.get $depth)) ${saved}
      (local.set $containerBaseDepth ${hasSpeculation ? `(if (result i32) (local.get $specOpen) (then ${spec.outerField("depth")}) (else (local.get $depth)))` : "(local.get $depth)"})
      (local.set $containerBaseState ${hasSpeculation ? `(if (result i32) (local.get $specOpen) (then ${spec.outerField("state")}) (else (local.get $state)))` : "(local.get $state)"})
      (local.set $containerIndex (if (result i32) (i32.ge_s (local.get $containerNext) (i32.const 0)) (then (local.get $containerNext)) (else (i32.const 0))))
      (local.set $containerLine (i32.const 0)) (local.set $containerNext (i32.const -1))
      (block $containerDone (loop $containerLoop
        (br_if $containerDone (i32.gt_u (local.get $containerIndex) (local.get $containerBaseDepth)))
        (local.set $containerFrameState (if (result i32) (i32.lt_u (local.get $containerIndex) (local.get $containerBaseDepth))
          (then (i32.load offset=${framesOffset} ${frameAt("(local.get $containerIndex)")})) (else (local.get $containerBaseState))))
        (block $containerContinue ${cases})
        (local.set $containerIndex (i32.add (local.get $containerIndex) (i32.const 1))) (br $containerLoop)))))`;
}
