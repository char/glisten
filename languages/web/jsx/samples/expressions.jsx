import * as UI from './ui';

const icon = <svg viewBox="0 0 12 12"><path d="M0 0 L12 12" /></svg>;
const empty = <></>;
const note = 'line\n\u{1F331}';
const count = 0x10 + 0b10 + 1_000;
const matcher = /[<>/]+/g;
const fraction = count / 2;

export function Preview({ title, entries, active }) {
  const description = `Showing ${entries.length} ${
    active ? `active: ${title}` : 'all'
  }`;
  return (
    <>
      <UI.Header title={description} icon={icon} />
      <custom-card data-mode="full" xml:lang='fr'>
        Bonjour, 世界 &lt;3
        {entries.map((entry, index) => (
          <div key={entry.id} style={{ opacity: index / 10 }}>
            {matcher.test(entry.name) ? 'special' : entry.name}
            {entry.url && <a href={entry.url}>Open</a>}
          </div>
        ))}
      </custom-card>
      {active && <span>{`nested ${`${fraction}`}`}</span>}
      <input type="text" defaultValue={note} />
      <br />
    </>
  );
}

// A normal expression after JSX must not remain in a tag.
const smaller = fraction < count;
const divided = count / fraction;
export { empty, smaller, divided };
