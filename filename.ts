import catalog from "./_generated/languages.json" with { type: "json" };

type Matches = Map<string, string | null>;
const filenames: Matches = new Map();
const extensions: Matches = new Map();
const foldedExtensions: Matches = new Map();
const asciiLower = (value: string) => value.replace(/[A-Z]/g, (char) => char.toLowerCase());
let longestExtension = 0;

function register(matches: Matches, key: string, language: string): void {
  if (!matches.has(key)) matches.set(key, language);
  else if (matches.get(key) !== language) matches.set(key, null);
}

for (const { language, filenames: names, extensions: suffixes } of catalog) {
  for (const filename of names) register(filenames, filename, language);
  for (const extension of suffixes) {
    register(extensions, extension, language);
    register(foldedExtensions, asciiLower(extension), language);
    longestExtension = Math.max(longestExtension, extension.length);
  }
}

/**
 * Resolve a filename or path to a bundled language, without loading any Wasm.
 * Exact basenames win, followed by the longest extension. Extension case is
 * folded only when there is no exact match. Unknown or ambiguous matches return undefined.
 */
export function languageFor(path: string): string | undefined {
  const basename = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const named = filenames.get(basename);
  if (named !== undefined) return named ?? undefined;
  for (
    let dot = basename.indexOf(".", Math.max(1, basename.length - longestExtension - 1));
    dot !== -1;
    dot = basename.indexOf(".", dot + 1)
  ) {
    const extension = basename.slice(dot + 1);
    const exact = extensions.get(extension);
    const match = exact === undefined ? foldedExtensions.get(asciiLower(extension)) : exact;
    if (match !== undefined) return match ?? undefined;
  }
  return undefined;
}
