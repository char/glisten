import { bytesOf, type Matcher } from "#/grammar/mod.ts";
import { visitMatchers } from "#/grammar/visit.ts";

type Shape = { consumes: boolean; newline: boolean; crosses: boolean };
const empty: Shape = { consumes: false, newline: false, crosses: false };
const unknown: Shape = { consumes: true, newline: true, crosses: true };

/** Conservatively determine whether a consuming matcher sequence can cross a physical line. */
export function mayCrossLine(matchers: readonly Matcher[]): boolean {
  const shapes = new Map<Matcher, Shape>();
  function sequence(items: readonly Matcher[]): Shape {
    return items.reduce((left, item) => {
      const right = shapes.get(item)!;
      return {
        consumes: left.consumes || right.consumes,
        newline: left.newline || right.newline,
        crosses: left.crosses || right.crosses || (left.newline && right.consumes),
      };
    }, empty);
  }
  function shape(item: Matcher): Shape {
    switch (item.kind) {
      case "literal": {
        const bytes = new TextEncoder().encode(item.text);
        return {
          consumes: bytes.length > 0,
          newline: bytes.includes(10),
          crosses: bytes.subarray(0, Math.max(0, bytes.length - 1)).includes(10),
        };
      }
      case "one":
        return { consumes: true, newline: bytesOf(item.set).includes(10), crosses: false };
      case "character":
        return { consumes: true, newline: true, crosses: false };
      case "run": {
        const consumes = item.max !== 0;
        const newline = consumes && bytesOf(item.set).includes(10);
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
          newline: bytesOf(item.first).includes(10),
          crosses: false,
        };
        const newline = bytesOf(item.rest).includes(10);
        const rest: Shape = { consumes: true, newline, crosses: newline };
        const suffix = sequence(item.suffix);
        const join = (left: Shape, right: Shape): Shape => ({
          consumes: left.consumes || right.consumes,
          newline: left.newline || right.newline,
          crosses: left.crosses || right.crosses || (left.newline && right.consumes),
        });
        return join(join(first, rest), suffix);
      }
      case "separatedRun": {
        const newline = bytesOf(item.set).includes(10) || bytesOf(item.separators).includes(10);
        return { consumes: true, newline, crosses: newline };
      }
      case "sameRun":
      case "captured":
      case "queueText":
      case "queueFooter":
      case "group":
        return unknown;
      case "baseState":
      case "ahead":
      case "notAhead":
      case "notNext":
      case "notBehind":
      case "lineEnd":
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
export const crossesLineFunction = `(func $crossesLine (param $input i32) (param $start i32) (param $end i32) (result i32)
  (block $done (loop $next
    (br_if $done (i32.ge_u (i32.add (local.get $start) (i32.const 1)) (local.get $end)))
    (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $start))) (i32.const 10)) (then (return (i32.const 1))))
    (local.set $start (i32.add (local.get $start) (i32.const 1)))
    (br $next)))
  (i32.const 0))`;

/** Emit a branch only when the match cannot be proved line-local. */
export function lineBoundaryCheck(matchers: readonly Matcher[], failure: string): string {
  return mayCrossLine(matchers)
    ? `(br_if ${failure} (call $crossesLine (local.get $input) (local.get $pos) (local.get $p)))`
    : "";
}
