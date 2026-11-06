import type { Fragment } from "./template.ts";

/** A named top-level WAT definition. Its body excludes the definition's kind and name. */
export type Def = {
  readonly type: "def";
  readonly name: string;
  readonly kind: "func" | "global" | "data";
  readonly body: () => Fragment;
};

/** A fresh branch target, scoped to each printing operation. */
export type Label = { readonly type: "label"; readonly hint: string };

/** A fresh local name, scoped to each printing operation. */
export type Local = { readonly type: "local"; readonly hint: string };

/** Define a function; its body is evaluated only if the definition is reached. */
export function func(name: string, body: () => Fragment): Def {
  return { type: "def", kind: "func", name, body };
}

/** Define a global; its body is evaluated only if the definition is reached. */
export function global(name: string, body: () => Fragment): Def {
  return { type: "def", kind: "global", name, body };
}

/** Define a data segment; its body is evaluated only if the definition is reached. */
export function data(name: string, body: () => Fragment): Def {
  return { type: "def", kind: "data", name, body };
}

/** Create a distinct branch target with a readable name hint. */
export function label(hint: string): Label {
  return { type: "label", hint };
}

/** Create a distinct local with a readable name hint. */
export function local(hint: string): Local {
  return { type: "local", hint };
}
