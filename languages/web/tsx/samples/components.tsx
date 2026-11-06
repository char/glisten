import { useState } from 'react';
import type { ReactNode } from 'react';

interface Item { id: string; label: string; count: number }
interface ListProps<T extends Item> {
  items: readonly T[];
  renderExtra?: (item: T) => ReactNode;
}

/** A list with a localized empty state. */
export function ItemList<T extends Item>({ items, renderExtra }: ListProps<T>) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <section aria-label="Inventaire">
      <h1>Items &amp; supplies</h1>
      {items.length === 0 ? <p>Rien ici — 世界</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-selected={selected === item.id}>
              <button onClick={() => setSelected(item.id)}>{item.label}</button>
              <span>{item.count / 2}</span>
              {renderExtra?.(item)}
            </li>
          ))}
        </ul>
      )}
      {/* A JSX comment, not visible text. */}
      <button disabled={selected === null} onClick={() => setSelected(null)}>
        Clear selection
      </button>
    </section>
  );
}

const sample: Item[] = [{ id: 'tea', label: 'thé', count: 2 }];
export const preview = <ItemList<Item> items={sample} renderExtra={(item) => <em>{item.id}</em>} />;
