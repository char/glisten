// Near misses and intentionally incomplete TSX edits.
type Typeahead = string;
interface InterfaceExtra { className: string }
const typewriter: Typeahead = 'type';
const satisfiesValue = false;
const readonlyField = 1;
const café: string = '東京';
const arrow = <T,>(value: T): T => value;
const comparison = readonlyField < 10 && 10 > readonlyField;
const genericCall = arrow<Array<string>>(['x']);
const quotient = 10 / 2;
const regex = /<[^/]+\/>/g;
const template = `outer ${`inner ${quotient}`}`;
const view = (
  <UI.Panel<string> data-kind="x" title='café'>
    Text with / and &lt;.
    {/* <NotATag /> */}
    {comparison ? <b>yes</b> : <i>no</i>}
    {({ nested: { n: 1 } }).nested.n}
    <custom-element {...{ title: typewriter }} />
  </UI.Panel>
);
const after: number = quotient / 2;
const badHex = 0xZ;
const badEscape = '\xZZ';
const missingString = 'unfinished
const recovered: number = 1;
const missingRegex = /[abc
const recoveredAgain = 2;
// Unfinished JSX attribute at end of file.
const partial = <Widget<string> title="unfinished
