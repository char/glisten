// Incomplete TypeScript, keyword prefixes, and ambiguous angle brackets.
type Typewriter = string;
interface InterfaceLike { readonlyValue: number }
const typeName: Typewriter = 'type';
const interfaceName = 'interface';
const satisfiesValue = true;
const readonlyValue = 1;
const unknownValue = 2;
const café: string = 'naïve';
const limit = 10;
const less = readonlyValue < limit;
const greater = limit > readonlyValue;
const generic = identity<Array<string>>(['a']);
const genericArrow = <T extends { id: string }>(item: T): string => item.id;
const cast = <Array<string>>generic;
const tricky = limit / 2 / 5;
const regex = /[\]/]+/g;
const template = `outer ${`inner ${generic.length / 2}`}`;
const badHex = 0xQ;
const badEscape = '\u12XZ';
const missingString = 'unfinished
const recovered: number = 1;
const missingRegex = /[abc
const recoveredAgain: number = 2;
type PartialGeneric = Map<string, Array<number>>;
type Conditional<T> = T extends string ? T[] : never;
const object = { type: 1, interface: 2, readonly: 3 };
object.type / 2;
type Named = [name /* label */ ?: string, next: number];
type ConditionalTuple = [string extends number ? Date : Error];
type Callback = (value /* parameter */ ?: string) => void;
interface Methods { run /* method */ <T>(value: T): void; }
// The trailing type is intentionally unfinished.
const partial: Map<string,
