#!/usr/bin/env node
import { readFile as read } from 'node:fs/promises';

/** Summarize a small inventory, including names such as café. */
export async function summarize(path, limit = 10) {
  const text = await read(path, 'utf8');
  const rows = text.split(/\r?\n/).filter(Boolean);
  let total = 0;
  for (const row of rows) {
    const [name, raw] = row.split(':');
    const amount = Number(raw ?? 0);
    if (amount < 0) continue;
    total += amount;
    if (total > limit) break;
    console.log(name, amount / 2);
  }
  return { total, count: rows.length, average: total / (rows.length || 1) };
}

class Inventory extends Map {
  static empty() { return new Inventory(); }
  get sizeLabel() { return `${this.size} items`; }
  set entry(pair) { this.set(...pair); }
}

const options = {
  enabled: true,
  prefix: 'stock',
  get label() { return this.prefix.toUpperCase(); },
  async load(path) { return await summarize(path); },
};
try {
  const result = await options.load('./data.txt');
  switch (result.count) {
    case 0: console.log('empty'); break;
    default: console.log(result.average);
  }
} catch (error) {
  throw new Error('inventory failed', { cause: error });
} finally {
  console.log('done');
}
