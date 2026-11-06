type Event =
  | { kind: "open"; offset: number }
  | { kind: "close"; offset: number }
  | { kind: "line"; offset: number; protected: boolean };

type Scan = { events: Event[]; unclosed?: number; lineComment: boolean };

/** Identify structural parentheses and line starts without interpreting WAT literals. */
export function scan(text: string): Scan {
  const events: Event[] = [{ kind: "line", offset: 0, protected: false }];
  const blocks: number[] = [];
  let quote: number | undefined;
  let lineComment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\n") {
      lineComment = false;
      events.push({
        kind: "line",
        offset: i + 1,
        protected: quote !== undefined || blocks.length > 0,
      });
      continue;
    }
    if (lineComment) continue;
    if (quote !== undefined) {
      if (char === "\\" && next !== "\n") i++;
      else if (char === '"') quote = undefined;
      continue;
    }
    if (blocks.length) {
      if (char === "(" && next === ";") {
        blocks.push(i);
        i++;
      } else if (char === ";" && next === ")") {
        blocks.pop();
        i++;
      }
      continue;
    }
    if (char === '"') quote = i;
    else if (char === ";" && next === ";") {
      lineComment = true;
      i++;
    } else if (char === "(" && next === ";") {
      blocks.push(i);
      i++;
    } else if (char === "(") events.push({ kind: "open", offset: i });
    else if (char === ")") events.push({ kind: "close", offset: i });
  }
  return { events, unclosed: quote ?? blocks[0], lineComment };
}

/** Reject unbalanced WAT with a location and surrounding source. */
export function checkBalance(text: string): void {
  const stack: number[] = [];
  const result = scan(text);
  const fail = (offset: number): never => {
    const excerpt = text.slice(Math.max(0, offset - 24), Math.min(text.length, offset + 25));
    throw new Error(`Unbalanced WAT at offset ${offset} near ${JSON.stringify(excerpt)}`);
  };
  for (const event of result.events) {
    if (event.kind === "open") stack.push(event.offset);
    if (event.kind === "close" && stack.pop() === undefined) fail(event.offset);
  }
  const offset = result.unclosed ?? stack[stack.length - 1];
  if (offset !== undefined) fail(offset);
}

/** Indent structural lines while preserving the contents of strings and block comments. */
export function indent(text: string): string {
  text = text.trim();
  const events: Event[] = [
    ...scan(text).events,
    { kind: "line", offset: text.length + 1, protected: false },
  ];
  const lines: string[] = [];
  let depth = 1;
  let lineDepth = 1;
  let lineStart = 0;
  let protectedLine = false;
  for (const event of events) {
    if (event.kind === "open") depth++;
    else if (event.kind === "close") depth--;
    else if (event.offset > 0) {
      const line = text.slice(lineStart, event.offset - 1);
      const content = protectedLine ? line : line.trimStart();
      const indentation = Math.max(0, lineDepth - (content.startsWith(")") ? 1 : 0));
      lines.push(protectedLine ? content : "  ".repeat(indentation) + content);
      lineStart = event.offset;
      protectedLine = event.protected;
      lineDepth = depth;
    }
  }
  return lines.join("\n");
}
