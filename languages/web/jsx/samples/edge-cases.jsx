// Incomplete edits and lookalikes in JSX and JavaScript.
const returnValue = 1;
const classNameExtra = 'ok';
const asyncThing = false;
const text = 'not <A attr="x" />';
const regex = /<tag\s*\/>/i;
const division = 24 / 3 / 2;
const nested = `outer ${`inner ${returnValue}`}`;
const attribute = 'a\n\x41';
const card = (
  <Widget data-note="// not a comment" title='café'>
    Text with / slashes and &amp; entities.
    {/* real comment: <Fake /> */}
    {returnValue < 3 ? <b>small</b> : <i>large</i>}
    {({ value: { n: 1 } }).value.n}
    <ns:tag data-extra="yes" />
  </Widget>
);
const nearby = <span title="ok">nearby</span>;
const after = returnValue / 2;
const near = <widget-name disabled />;
const uppercase = <UI.Part value={/x/.test(text)} />;
const fragment = <>hello <b>world</b></>;
const string = 'unfinished
const recovered = 42;
const unfinishedRegex = /[abc
const again = 3;
// Intentionally malformed closing tag, then an unfinished attribute.
const mismatch = <a><b /></c>;
const partial = <Panel title="unfinished
