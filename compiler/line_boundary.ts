import { bytesOf, type Matcher } from "#/grammar/mod.ts";
import { visitMatchers } from "#/grammar/visit.ts";

const newlineByte = "\n".charCodeAt(0);

type Shape = { consumes: boolean; newline: boolean; crosses: boolean };
const empty: Shape = { consumes: false, newline: false, crosses: false };
const unknown: Shape = { consumes: true, newline: true, crosses: true };

/** Conservatively determine whether a consuming matcher sequence can cross a physical line. */
export function mayCrossLine(matchers: readonly Matcher[]): boolean {
  const shapes = new Map<Matcher, Shape>();
  function join(left: Shape, right: Shape): Shape {
    return {
      consumes: left.consumes || right.consumes,
      newline: left.newline || right.newline,
      crosses: left.crosses || right.crosses || (left.newline && right.consumes),
    };
  }
  function sequence(items: readonly Matcher[]): Shape {
    return items.reduce((left, item) => join(left, shapes.get(item)!), empty);
  }
  function shape(item: Matcher): Shape {
    switch (item.kind) {
      case "literal": {
        const bytes = new TextEncoder().encode(item.text);
        return {
          consumes: bytes.length > 0,
          newline: bytes.includes(newlineByte),
          crosses: bytes.subarray(0, Math.max(0, bytes.length - 1)).includes(newlineByte),
        };
      }
      case "one":
        return { consumes: true, newline: bytesOf(item.set).includes(newlineByte), crosses: false };
      case "character":
        return { consumes: true, newline: true, crosses: false };
      case "run": {
        const consumes = item.max !== 0;
        const newline = consumes && bytesOf(item.set).includes(newlineByte);
        return { consumes, newline, crosses: newline && (item.max === undefined || item.max > 1) };
      }
      case "toColumn":
        return { consumes: true, newline: false, crosses: false };
      case "either": {
        const alternatives = item.alternatives.map(sequence);
        return {
          consumes: alternatives.some((s) => s.consumes),
          newline: alternatives.some((s) => s.newline),
          crosses: alternatives.some((s) => s.crosses),
        };
      }
      case "opt":
        return sequence(item.matchers);
      case "repeat": {
        const inner = sequence(item.matchers);
        return { ...inner, crosses: inner.crosses || (inner.newline && inner.consumes) };
      }
      case "cachedPrefix": {
        const first: Shape = {
          consumes: true,
          newline: bytesOf(item.first).includes(newlineByte),
          crosses: false,
        };
        const newline = bytesOf(item.rest).includes(newlineByte);
        const rest: Shape = { consumes: true, newline, crosses: newline };
        const suffix = sequence(item.suffix);
        return join(join(first, rest), suffix);
      }
      case "separatedRun": {
        const newline =
          bytesOf(item.set).includes(newlineByte) || bytesOf(item.separators).includes(newlineByte);
        return { consumes: true, newline, crosses: newline };
      }
      case "sameRun":
      case "captured":
      case "queueText":
      case "queueFooter":
      case "group":
        return unknown;
      case "baseState":
      case "counterZero":
      case "counterPositive":
      case "ahead":
      case "notAhead":
      case "notNext":
      case "notBehind":
      case "previousChar":
      case "lineEnd":
      case "columnAtLeast":
      case "queueHas":
        return empty;
    }
  }
  visitMatchers(
    matchers,
    (item) => item.kind !== "ahead" && item.kind !== "notAhead",
    (item) => shapes.set(item, shape(item)),
  );
  return sequence(matchers).crosses;
}

/** Check the bytes before the last consumed byte for a newline. */
export const crossesLineFunction = `(func $crossesLine (param $input i32) (param $cursor i32)
  (param $end i32) (result i32)
  (block $done (loop $scanNext
    (br_if $done (i32.ge_u (i32.add (local.get $cursor) (i32.const 1)) (local.get $end)))
    (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $cursor))) (i32.const ${newlineByte}))
      (then (return (i32.const 1))))
    (local.set $cursor (i32.add (local.get $cursor) (i32.const 1)))
    (br $scanNext)))
  (i32.const 0))`;

/** Emit a branch only when the match cannot be proved line-local. */
export function lineBoundaryCheck(matchers: readonly Matcher[], failure: string): string {
  return mayCrossLine(matchers)
    ? `(br_if ${failure} (call $crossesLine (local.get $input) (local.get $pos) (local.get $matchCursor)))`
    : "";
}
