// Deliberate lexical near-misses and incomplete edits.
const returning = 1;
const constable = 2;
const asyncValue = 3;
const undefinedValue = 4;
const TRUE_VALUE = returning + constable;
const café = 'naïve';
const escaped = '\u0041\x42\u{43}\t\\\'';
const badEscape = '\xQZ';
const badNumber = 0xG;
const partialExponent = 12e+;
const oddSeparator = 1__2;
const quotient = (returning + 1) / 2;
const pattern = /[a/\]]+\/end/gi;
const alternative = returning ? /a/ : /b/;
if (returning) /start/.test('start');
const afterObject = ({ x: 4 }) / 2;
const afterArray = [4][0] / 2;
const nested = `outer ${`inner ${ { value: 1 }.value }`} tail`;
const braces = `${(() => ({ x: { y: 2 } }))().x.y}`;
const almostComment = '/* not a comment */';
const almostRegex = '// not a regex';
// A line comment ends here.
const afterComment = 5;
/* A block comment with // and "quotes". */
const afterBlock = 6;
const brokenString = 'unfinished
const recovered = 7;
const brokenRegex = /unterminated[
const recoveredAgain = 8;
const property = { return: 1, class: 2 };
property.return / 2;
while ((returning)) /while/.test('while');
with (Math) /with/.test('with');
label: if (returning) /label/.test('label');
if (returning) returning++; else if (constable) /else/.test('else');
async function iterate(xs) { for await (const x of xs) /item/.test(x); }
// The last block intentionally remains open.
/* unfinished block: 世界
