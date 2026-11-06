// Literals, escapes, regexes, and expression boundaries.
const greeting = 'Bonjour, 世界\n\u{1F44B}';
const quoted = "A \"quote\", a backslash \\, and \x41";
const continued = 'two\
lines';
const decimal = 1_234.50e-2;
const fraction = .75;
const trailing = 12.;
const hex = 0xCA_FE;
const binary = 0b1010_0101;
const octal = 0o755;
const huge = 9_007_199_254_740_993n;
const mask = 0xffn;
const slash = /[/\\]/gu;
const words = /\b[a-z]+(?:-[a-z]+)?\b/gi;
const ratio = decimal / fraction / 2;
const test = words.test(greeting) ? /yes/i : /no/i;
const message = `Hello ${greeting}, ${
  test.test('yes') ? `ratio: ${ratio / 2}` : `${{ text: 'none' }.text}`
}!`;
const raw = String.raw`C:\temp\${'file'}`;
const object = {
  [greeting]: 1,
  ...{ extra: null },
  nested: { value: undefined },
  method(x) { return x * x; },
};
const result = object?.nested?.value ?? false;
const flag = !result && (ratio >= 1 || ratio === 0);
const list = [1, 2, 3].map((n) => n ** 2);
// Regex after a return; division after a call.
function match(value) {
  return /a[\/]b/u.test(value);
}
const perItem = list.length / Math.max(1, object.method(2));
export { message, raw, flag, perItem, match, slash, quoted, continued, hex, binary, octal, huge, mask, trailing };
