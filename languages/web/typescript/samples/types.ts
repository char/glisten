/** Models a localized inventory entry. */
export interface Entry<T extends string = string> {
  readonly id: T;
  name: string;
  quantity?: number;
  tags: Array<string>;
  update(value: number): void;
}

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
export type Keys<T> = keyof T;
export type ReadonlyFields<T> = { readonly [K in keyof T]: T[K] };
export type Unwrap<T> = T extends Promise<infer U> ? U : T;
export type Pair = [name: string, count: number];
export type Formatter = (entry: Entry) => string;

export enum Status { New = 0, Ready = 1, Done = 2 }
export namespace Inventory {
  export const label: string = 'Épicerie';
  export function identity<T>(value: T): T { return value; }
}

export class Store<T extends Entry> implements Iterable<T> {
  private readonly items: T[] = [];
  constructor(public name: string) {}
  add(item: T): void { this.items.push(item); }
  *[Symbol.iterator](): Iterator<T> { yield* this.items; }
}

const initial: Entry<'tea'> = {
  id: 'tea', name: 'thé', tags: ['drink'],
  update(value: number) { this.quantity = value; },
};
const store = new Store<Entry>();
store.add(initial);
const config = { retries: 3, enabled: true } satisfies Record<string, number | boolean>;
const maybe = initial.quantity as number | undefined;
const definite = initial.quantity!;
export { store, config, maybe, definite };
