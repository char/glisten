import type { Def } from "./defs.ts";
import { indent, scan } from "./scanner.ts";
import { Printer, references, type Fragment } from "./template.ts";

/** Print a module containing only definitions reachable from its roots and header fragments. */
export function module(options: {
  imports?: Fragment[];
  memory?: Fragment;
  exports: Def[];
}): string {
  const seen = new Set<Def>();
  const names = new Map<string, Def>();
  const bodies: { def: Def; body: Fragment }[] = [];
  function visit(def: Def): void {
    const previous = names.get(def.name);
    if (previous && previous !== def) throw new Error(`Duplicate definition: ${def.name}`);
    if (seen.has(def)) return;
    seen.add(def);
    names.set(def.name, def);
    const body = def.body();
    bodies.push({ def, body });
    for (const ref of references(body)) visit(ref);
  }
  for (const root of options.exports) visit(root);
  const headers = [...(options.imports ?? [])];
  if (options.memory) headers.push(options.memory);
  for (const header of headers) for (const ref of references(header)) visit(ref);
  const printer = new Printer(new Set(names.keys()));
  const parts = headers.map((header) => printer.render(header));
  for (const { def, body } of bodies) {
    const text = printer.render(body);
    const separator = text ? " " : "";
    const end = scan(text).lineComment ? "\n)" : ")";
    parts.push(`(${def.kind} $${def.name}${separator}${text}${end}`);
  }
  return `(module\n${parts.map(indent).join("\n")}\n)`;
}
