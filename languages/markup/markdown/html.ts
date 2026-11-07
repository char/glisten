import { func, raw, wat } from "#/testing/wat/mod.ts";
import { stopScan } from "#/compiler/runtime.ts";

const blockNames =
  "address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul".split(
    " ",
  );

function matches(text: string, folded = false): string {
  const tests: string[] = [];
  for (let offset = 0; offset < text.length; offset += 8) {
    const chunk = text.slice(offset, offset + 8);
    let value = 0n,
      mask = 0n,
      fold = 0n;
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i),
        shift = BigInt(i * 8);
      value |= BigInt(code) << shift;
      mask |= 255n << shift;
      if (folded && code >= 97 && code <= 122) fold |= 32n << shift;
    }
    const load = `(i64.load offset=${offset} (i32.add (local.get $input) (local.get $pos)))`;
    tests.push(
      `(i64.eq (i64.and (i64.or ${load} (i64.const ${fold})) (i64.const ${mask})) (i64.const ${value}))`,
    );
  }
  return [
    `(i32.ge_u (i32.sub (local.get $end) (local.get $pos)) (i32.const ${text.length}))`,
    ...tests,
  ].reduce((a, b) => `(i32.and ${a} ${b})`);
}

function htmlTag() {
  return func("htmlTag", () =>
    raw(`
    (param $input i32) (param $pos i32) (param $end i32) (result i32)
    (local $b i32) (local $closing i32) (local $space i32) (local $quote i32)
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
    (if (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 47)) (then
      (local.set $closing (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))
    (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
    (local.set $b (i32.or (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
    (if (i32.gt_u (i32.sub (local.get $b) (i32.const 97)) (i32.const 25)) (then (return (i32.const 0))))
    (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
    (block $nameDone (loop $name
      (br_if $nameDone (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (br_if $nameDone (i32.and (i32.ne (local.get $b) (i32.const 45))
        (i32.and (i32.gt_u (i32.sub (i32.or (local.get $b) (i32.const 32)) (i32.const 97)) (i32.const 25))
          (i32.gt_u (i32.sub (local.get $b) (i32.const 48)) (i32.const 9)))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $name)))
    (block $done (loop $attributes
      (local.set $space (i32.const 0))
      (block $whiteDone (loop $white
        (br_if $whiteDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $whiteDone (i32.and (i32.ne (local.get $b) (i32.const 32)) (i32.ne (local.get $b) (i32.const 9))))
        (local.set $space (i32.const 1)) (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $white)))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
      (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $b) (i32.const 62)) (then (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $done)))
      (if (i32.and (i32.eqz (local.get $closing)) (i32.eq (local.get $b) (i32.const 47))) (then
        (if (i32.or (i32.ge_u (i32.add (local.get $pos) (i32.const 1)) (local.get $end))
          (i32.ne (i32.load8_u offset=1 (i32.add (local.get $input) (local.get $pos))) (i32.const 62))) (then (return (i32.const 0))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 2))) (br $done)))
      (if (i32.or (local.get $closing) (i32.eqz (local.get $space))) (then (return (i32.const 0))))
      (if (i32.and (i32.ne (local.get $b) (i32.const 95)) (i32.and (i32.ne (local.get $b) (i32.const 58))
        (i32.gt_u (i32.sub (i32.or (local.get $b) (i32.const 32)) (i32.const 97)) (i32.const 25)))) (then (return (i32.const 0))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (block $attrDone (loop $attr
        (br_if $attrDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $attrDone (i32.and (i32.and (i32.ne (local.get $b) (i32.const 95)) (i32.ne (local.get $b) (i32.const 58)))
          (i32.and (i32.and (i32.ne (local.get $b) (i32.const 45)) (i32.ne (local.get $b) (i32.const 46)))
            (i32.and (i32.gt_u (i32.sub (i32.or (local.get $b) (i32.const 32)) (i32.const 97)) (i32.const 25))
              (i32.gt_u (i32.sub (local.get $b) (i32.const 48)) (i32.const 9))))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $attr)))
      (local.set $quote (local.get $pos))
      (block $beforeEqDone (loop $beforeEq
        (br_if $beforeEqDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $beforeEqDone (i32.and (i32.ne (local.get $b) (i32.const 32)) (i32.ne (local.get $b) (i32.const 9))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $beforeEq)))
      (if (i32.or (i32.ge_u (local.get $pos) (local.get $end))
        (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 61))) (then
        (local.set $pos (local.get $quote)) (br $attributes)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
      (block $valueWhiteDone (loop $valueWhite
        (br_if $valueWhiteDone (i32.ge_u (local.get $pos) (local.get $end)))
        (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
        (br_if $valueWhiteDone (i32.and (i32.ne (local.get $b) (i32.const 32)) (i32.ne (local.get $b) (i32.const 9))))
        (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $valueWhite)))
      (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
      (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.or (i32.eq (local.get $b) (i32.const 34)) (i32.eq (local.get $b) (i32.const 39))) (then
        (local.set $quote (local.get $b)) (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
        (block $quotedDone (loop $quoted
          (if (i32.ge_u (local.get $pos) (local.get $end)) (then (return (i32.const 0))))
          (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
          (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
          (br_if $quotedDone (i32.eq (local.get $b) (local.get $quote))) (br $quoted))))
        (else
          (local.set $quote (local.get $pos))
          (block $unquotedDone (loop $unquoted
            (br_if $unquotedDone (i32.ge_u (local.get $pos) (local.get $end)))
            (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
            (br_if $unquotedDone (i32.or (i32.le_u (local.get $b) (i32.const 32))
              (i32.or (i32.eq (local.get $b) (i32.const 34)) (i32.or (i32.eq (local.get $b) (i32.const 39))
                (i32.or (i32.eq (local.get $b) (i32.const 60)) (i32.or (i32.eq (local.get $b) (i32.const 61))
                  (i32.or (i32.eq (local.get $b) (i32.const 62)) (i32.eq (local.get $b) (i32.const 96)))))))))
            (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $unquoted)))
          (if (i32.eq (local.get $quote) (local.get $pos)) (then (return (i32.const 0))))))
      (br $attributes)))
    (if (i32.eqz (local.get $pos)) (then (return (i32.const 0))))
    (local.get $pos)`),
  );
}

export function htmlEnd() {
  const scan = stopScan("htmlEndScan", [45, 60, 62, 63, 93], false);
  const rawEnd = ["</script>", "</pre>", "</style>", "</textarea>"]
    .map((name) => matches(name, true))
    .reduce((a, b) => `(i32.or ${a} ${b})`);
  return func(
    "htmlEnd",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32) (param $mode i32) (result i32)
    (block $done (loop $more
      (local.set $pos (call ${scan} (local.get $input) (local.get $pos) (local.get $end)))
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (if (i32.lt_u (local.get $mode) (i32.const 8)) (then
        (if ${raw(rawEnd)} (then (return (i32.const 1)))))
        (else
          (if (i32.eq (local.get $mode) (i32.const 8)) (then
            (if ${raw(matches("-->"))} (then (return (i32.const 1))))))
          (if (i32.eq (local.get $mode) (i32.const 9)) (then
            (if ${raw(matches("?>"))} (then (return (i32.const 1))))))
          (if (i32.eq (local.get $mode) (i32.const 10)) (then
            (if ${raw(matches(">"))} (then (return (i32.const 1))))))
          (if (i32.eq (local.get $mode) (i32.const 11)) (then
            (if ${raw(matches("]]>"))} (then (return (i32.const 1))))))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $more)))
    (i32.const 0)`,
  );
}

export function htmlStart() {
  const tag = htmlTag();
  const boundary = (slash: boolean) => `(i32.or (i32.ge_u (local.get $after) (local.get $end))
    (i32.or (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $after))) (i32.const 32))
      (i32.or (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $after))) (i32.const 9))
        (i32.or (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $after))) (i32.const 13))
          (i32.or (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $after))) (i32.const 62))
            ${slash ? `(i32.and (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $after))) (i32.const 47)) (i32.and (i32.lt_u (i32.add (local.get $after) (i32.const 1)) (local.get $end)) (i32.eq (i32.load8_u offset=1 (i32.add (local.get $input) (local.get $after))) (i32.const 62))))` : "(i32.const 0)"})))))`;
  const block = blockNames
    .map(
      (name) => `(if ${matches(name, true)} (then
    (local.set $after (i32.add (local.get $pos) (i32.const ${name.length})))
    (if ${boundary(true)} (then (return (i32.const 12))))))`,
    )
    .join("\n");
  const rawNames = ["script", "pre", "style", "textarea"]
    .map(
      (name, i) => `(if ${matches(name, true)} (then
    (local.set $after (i32.add (local.get $pos) (i32.const ${name.length})))
    (if ${boundary(false)} (then (return (i32.const ${4 + i}))))))`,
    )
    .join("\n");
  return func(
    "htmlStart",
    () => wat`
    (param $input i32) (param $pos i32) (param $end i32) (param $interrupt i32) (param $virtual i32) (result i32)
    (local $start i32) (local $after i32) (local $b i32)
    (local.set $start (local.get $pos))
    (block $indented (loop $indent
      (br_if $indented (i32.ge_u (local.get $pos) (local.get $end)))
      (br_if $indented (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 32)))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $indent)))
    (if (i32.or (i32.gt_u (i32.add (local.get $virtual) (i32.sub (local.get $pos) (local.get $start))) (i32.const 3))
      (i32.ge_u (local.get $pos) (local.get $end))) (then (return (i32.const 0))))
    (if (i32.ne (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 60)) (then (return (i32.const 0))))
    (local.set $pos (i32.add (local.get $pos) (i32.const 1)))
    ${raw(`(if ${matches("!--")} (then (return (i32.const 8))))
    (if ${matches("?")} (then (return (i32.const 9))))
    (if ${matches("![CDATA[")} (then (return (i32.const 11))))`)}
    (if (i32.ge_u (i32.sub (local.get $end) (local.get $pos)) (i32.const 2)) (then
      (if (i32.and (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 33))
        (i32.le_u (i32.sub (i32.load8_u offset=1 (i32.add (local.get $input) (local.get $pos))) (i32.const 65)) (i32.const 25)))
        (then (return (i32.const 10))))))
    ${raw(rawNames)}
    (local.set $after (local.get $pos))
    (if (i32.and (i32.lt_u (local.get $pos) (local.get $end))
      (i32.eq (i32.load8_u (i32.add (local.get $input) (local.get $pos))) (i32.const 47)))
      (then (local.set $pos (i32.add (local.get $pos) (i32.const 1)))))
    ${raw(block)}
    (if (local.get $interrupt) (then (return (i32.const 0))))
    (local.set $pos (call ${tag} (local.get $input) (local.get $after) (local.get $end)))
    (if (i32.eqz (local.get $pos)) (then (return (i32.const 0))))
    (block $done (loop $trailing
      (br_if $done (i32.ge_u (local.get $pos) (local.get $end)))
      (local.set $b (i32.load8_u (i32.add (local.get $input) (local.get $pos))))
      (if (i32.eq (local.get $b) (i32.const 13)) (then
        (return (if (result i32) (i32.eq (i32.add (local.get $pos) (i32.const 1)) (local.get $end)) (then (i32.const 12)) (else (i32.const 0))))))
      (if (i32.and (i32.ne (local.get $b) (i32.const 32)) (i32.ne (local.get $b) (i32.const 9))) (then (return (i32.const 0))))
      (local.set $pos (i32.add (local.get $pos) (i32.const 1))) (br $trailing)))
    (i32.const 12)`,
  );
}
