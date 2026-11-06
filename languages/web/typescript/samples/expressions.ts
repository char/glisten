import type { Entry, Result } from './types';

export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  if (result.ok) return { ok: true, value: fn(result.value) };
  return result;
}

const identity = <T>(value: T): T => value;
const names: Array<string> = ['café', '茶'];
const nested: Map<string, Array<number>> = new Map();
const lengths = names.map<number>((name) => name.length);
const comparison = lengths[0] < lengths[1] && lengths[1] > 0;
const shifted = 32 >> 2;
const asserted = <string>names[0];
const regex: RegExp = /[a-z\/]+/giu;
const quotient: number = lengths[0] / 2;
const text = `Names: ${names.map((name) => `${name}: ${name.length}`).join(', ')}`;
const hexadecimal = 0xFE_ED;
const binary = 0b1010;
const octal = 0o77;
const integer = 12_345n;
const fraction = .5e+2;
const escape = "\u0041\x42\n";

function format(entry: Entry | null): string {
  const quantity = entry?.quantity ?? 0;
  return entry ? `${entry.name}: ${quantity / 2}` : 'none';
}

async function load<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new Error('load failed', { cause: error });
  }
}
export { identity, nested, comparison, shifted, asserted, regex, quotient, text, hexadecimal, binary, octal, integer, fraction, escape, format, load };
