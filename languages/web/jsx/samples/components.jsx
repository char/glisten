import { useState } from 'react';

/** A small editable list, including Unicode labels. */
export function Pantry({ initialItems, onSave }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState('');
  const visible = items.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <section className="pantry" aria-label='Épicerie'>
      <h1>Pantry &amp; supplies</h1>
      <label>
        Filter
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {visible.length === 0 ? <p>Nothing here yet.</p> : (
        <ul>
          {visible.map((item) => (
            <Pantry.Row key={item.id} item={item} onSave={onSave} />
          ))}
        </ul>
      )}
      {/* JSX comments live inside expression braces. */}
      <button disabled={items.length === 0} onClick={() => setItems([])}>
        Clear {items.length} items
      </button>
    </section>
  );
}

Pantry.Row = function Row({ item, onSave }) {
  return (
    <li data-id={item.id} {...item.attributes}>
      <strong>{item.name}</strong>: {item.quantity / 2}
      <button onClick={() => onSave({ ...item, quantity: item.quantity + 1 })}>
        Add one
      </button>
    </li>
  );
};
