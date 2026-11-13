import { Execution, ResourceError, type Call, type Guest } from "./execution.ts";
import { Languages } from "./languages.ts";

export type Result =
  | {
      status: "ok";
      spans: Uint32Array;
      missing: string[];
      groups?: Uint32Array;
      values?: (string | undefined)[];
    }
  | { status: "resource" };

export type Session = {
  status: "ok";
  input: number;
  length: number;
  spans: Call;
  missing: string[];
  groups?: Uint32Array;
  values?: (string | undefined)[];
};

export function own(execution: Execution, session: Session): Extract<Result, { status: "ok" }> {
  const spans = execution.words(session.spans).slice();
  const result: Extract<Result, { status: "ok" }> = {
    status: "ok",
    spans,
    missing: session.missing,
  };
  if (session.groups) result.groups = session.groups;
  if (session.values) result.values = session.values;
  return result;
}

type Document = { pieces: number[]; targets: number[] };

type Injection = {
  name: string;
  guest: Guest | undefined;
  pieces: number[];
  targets: number[];
};

type Projection = { start: number; end: number; source: number; target: number };

export function compose(
  execution: Execution,
  languages: Languages,
  language: string,
  source: string | Uint8Array,
): Session | { status: "resource" } {
  if (source.length === 0)
    return {
      status: "ok",
      input: 0,
      length: 0,
      spans: { offset: 0, count: 0, injections: 0, groups: 0 },
      missing: [],
    };

  execution.begin();
  let prepared: { input: number; length: number };
  let rootCall: Call;
  let rootDocuments: number;
  let root: Guest;

  try {
    prepared = execution.prepare(source);
    const resolved = languages.get(language);
    if (!resolved) {
      const offset = execution.allocate(8);
      const spans = new Uint32Array(execution.memory.buffer, offset, 2);
      spans[0] = prepared.length;
      spans[1] = languages.missingStyle;
      return {
        status: "ok",
        ...prepared,
        spans: { offset, count: 1, injections: 0, groups: 0 },
        missing: language ? [language] : [],
      };
    }

    root = resolved;
    rootDocuments = execution.allocate(8);
    const document = new Uint32Array(execution.memory.buffer, rootDocuments, 2);
    document[0] = 0;
    document[1] = prepared.length;
    rootCall = execution.call(root, prepared.input, prepared.length, rootDocuments, 1);

    if (!rootCall.injections) {
      if (!rootCall.groups) return { status: "ok", ...prepared, spans: rootCall, missing: [] };
      return compactRootGroups(execution, prepared, rootCall);
    }
  } catch (error) {
    if (error instanceof ResourceError) return { status: "resource" };
    throw error;
  }

  return composeInjections(execution, languages, root, prepared, rootCall, rootDocuments);
}

function compactRootGroups(
  execution: Execution,
  prepared: { input: number; length: number },
  rootCall: Call,
): Session {
  const records = execution.words(rootCall);
  const groups = new Uint32Array(rootCall.groups * 3);
  let used = 0;
  let groupCount = 0;
  let end = 0;
  for (let i = 0; i < records.length; i += 2) {
    const value = records[i]!;
    const word = records[i + 1]!;
    if (word >>> 29 === 2) {
      groups[groupCount++] = value;
      groups[groupCount++] = end;
      groups[groupCount++] = word & 0x1fff_ffff;
    } else {
      end = value;
      if (used && records[used - 1] === word) records[used - 2] = end;
      else {
        records[used++] = end;
        records[used++] = word;
      }
    }
  }

  let ordered = true;
  for (let i = 3; i < groupCount; i += 3) {
    if (
      groups[i - 3]! > groups[i]! ||
      (groups[i - 3] === groups[i] && groups[i - 2]! <= groups[i + 1]!)
    ) {
      ordered = false;
      break;
    }
  }

  let resultGroups = groups.subarray(0, groupCount);
  if (!ordered) {
    const order = Array.from({ length: groupCount / 3 }, (_, i) => i).sort(
      (a, b) => groups[a * 3]! - groups[b * 3]! || groups[b * 3 + 1]! - groups[a * 3 + 1]! || b - a,
    );
    resultGroups = new Uint32Array(groupCount);
    for (let i = 0; i < order.length; i++) {
      const at = order[i]! * 3;
      resultGroups[i * 3] = groups[at]!;
      resultGroups[i * 3 + 1] = groups[at + 1]!;
      resultGroups[i * 3 + 2] = groups[at + 2]!;
    }
  }
  return {
    status: "ok",
    ...prepared,
    spans: { ...rootCall, count: used / 2 },
    missing: [],
    groups: resultGroups,
  };
}

function composeInjections(
  execution: Execution,
  languages: Languages,
  root: Guest,
  prepared: { input: number; length: number },
  rootCall: Call,
  rootDocuments: number,
): Session | { status: "resource" } {
  const chunks: number[][] = [[]];
  const groups: number[] = [];
  const groupDepths: number[] = [];
  const values: (string | undefined)[] = [];
  const missing: string[] = [];
  const staticEmbeds = new Map<Guest, ({ name: string; guest: Guest | undefined } | undefined)[]>();
  const rootInput = prepared.input;
  const sourceLength = prepared.length;
  const decoder = new TextDecoder();

  function noteMissing(name: string): void {
    if (name && !missing.includes(name)) missing.push(name);
  }

  function linkLeafBatch(call: Call, documents: Document[], depth: number): void {
    const records = execution.words(call);
    let at = 0;
    let written = 0;
    for (const document of documents) {
      const end = document.pieces[1]!;
      const start = call.groups ? written : at;
      if (!call.groups) {
        while (at < records.length && records[at] !== end) at += 2;
        if (at >= records.length) throw new Error("Records do not cover document");
        at += 2;
      } else {
        let position = document.pieces[0]!;
        while (at < records.length) {
          const value = records[at]!;
          const word = records[at + 1]!;
          if (word >>> 29 === 2) {
            groups.push(value, position, word & 0x1fff_ffff);
            groupDepths.push(depth);
            values.push(undefined);
          } else {
            if (position === end) break;
            position = value;
            if (written > start && records[written - 1] === word) records[written - 2] = value;
            else {
              records[written++] = value;
              records[written++] = word;
            }
          }
          at += 2;
        }
        if (position !== end) throw new Error("Records do not cover document");
      }
      chunks[document.targets[0]!]!.push(
        call.offset + start * 4,
        call.offset + (call.groups ? written : at) * 4,
        0,
        end,
      );
    }
  }

  function prepareDocuments(
    documents: Document[],
    depth: number,
    singleOffset: number | undefined,
  ): { documentOffset: number; projections: Projection[][]; length: number } {
    let joinedLength = 0;
    const interrupted: boolean[] = [];
    for (const document of documents) {
      const pieces = document.pieces;
      let gaps = false;
      for (let i = 2; i < pieces.length; i += 2) {
        if (pieces[i] === pieces[i - 1]) continue;
        gaps = true;
        break;
      }
      interrupted.push(gaps);
      if (!gaps) continue;
      for (let i = 0; i < pieces.length; i += 2) {
        joinedLength += pieces[i + 1]! - pieces[i]!;
      }
    }

    const joined = joinedLength ? execution.allocate(joinedLength + 16, 16) : 0;
    const documentOffset =
      depth === 0 ? rootDocuments : (singleOffset ?? execution.allocate(documents.length * 8));
    const bytes = new Uint8Array(execution.memory.buffer);
    const documentWords = new Uint32Array(
      execution.memory.buffer,
      documentOffset,
      documents.length * 2,
    );
    const projections: Projection[][] = [];
    let cursor = joined - rootInput;
    for (let d = 0; d < documents.length; d++) {
      const pieces = documents[d]!.pieces;
      const projection: Projection[] = [];
      let position = interrupted[d] ? cursor : pieces[0]!;
      documentWords[d * 2] = position;
      for (let i = 0; i < pieces.length; i += 2) {
        const start = pieces[i]!;
        const end = pieces[i + 1]!;
        if (interrupted[d])
          bytes.copyWithin(rootInput + position, rootInput + start, rootInput + end);
        projection.push({
          start: position,
          end: position + end - start,
          source: start,
          target: documents[d]!.targets[i / 2]!,
        });
        position += end - start;
      }
      documentWords[d * 2 + 1] = position;
      projections.push(projection);
      if (interrupted[d]) cursor = position;
    }
    if (joinedLength) bytes.fill(0, joined + joinedLength, joined + joinedLength + 16);

    const length = Math.max(sourceLength, joinedLength ? cursor : 0);
    return { documentOffset, projections, length };
  }

  function scanRecords(
    guest: Guest,
    documents: Document[],
    depth: number,
    documentOffset: number,
    projections: Projection[][],
    call: Call,
    records: Uint32Array,
  ): Injection[] {
    const input = rootInput;
    const currentDocuments = new Uint32Array(
      execution.memory.buffer,
      documentOffset,
      documents.length * 2,
    );
    const injections: Injection[] = [];
    let embeds = staticEmbeds.get(guest);
    let doc = 0;
    let position = currentDocuments[0]!;
    let pieceCursor = 0;

    function project(start: number, end: number, target: number[]): void {
      const projection = projections[doc]!;
      while (pieceCursor > 0 && projection[pieceCursor - 1]!.end > start) pieceCursor--;
      while (pieceCursor < projection.length && projection[pieceCursor]!.end <= start)
        pieceCursor++;
      for (let index = pieceCursor; index < projection.length; index++) {
        const part = projection[index]!;
        if (part.start >= end) break;
        const sourceStart = part.source + Math.max(start, part.start) - part.start;
        const sourceEnd = part.source + Math.min(end, part.end) - part.start;
        const count = target.length;
        if (count && target[count - 1] === sourceStart) target[count - 1] = sourceEnd;
        else target.push(sourceStart, sourceEnd);
      }
    }

    const mapped: number[] = [];
    for (let i = 0; i < records.length; i += 2) {
      const value = records[i]!;
      const word = records[i + 1]!;
      const kind = word >>> 29;
      const id = word & 0x1fff_ffff;
      if (kind === 0 || kind === 4 || kind === 5) {
        while (doc < documents.length && position === currentDocuments[doc * 2 + 1]) {
          doc++;
          pieceCursor = 0;
          if (doc < documents.length) position = currentDocuments[doc * 2]!;
        }
        const projection = projections[doc]!;
        while (pieceCursor < projection.length && projection[pieceCursor]!.end <= position)
          pieceCursor++;
        const injection = kind === 0 ? undefined : injections[id];
        if (kind !== 0 && !injection) throw new Error("Invalid injection ID");
        for (let index = pieceCursor; index < projection.length; index++) {
          const piece = projection[index]!;
          if (piece.start >= value) break;
          const target = chunks[piece.target]!;
          if (injection) {
            const start = piece.source + Math.max(position, piece.start) - piece.start;
            const end = piece.source + Math.min(value, piece.end) - piece.start;
            const child = chunks.length;
            chunks.push([]);
            target.push(-child, 0, 0, 0);
            injection.pieces.push(start, end);
            injection.targets.push(child);
          } else {
            const address = call.offset + i * 4;
            const delta = piece.source - piece.start;
            const n = target.length;
            if (
              n &&
              target[n - 4]! > 0 &&
              target[n - 3] === address &&
              target[n - 2] === delta &&
              target[n - 1] === piece.end
            )
              target[n - 3] = address + 8;
            else target.push(address, address + 8, delta, piece.end);
          }
        }
        position = value;
      } else if (kind === 2) {
        mapped.length = 0;
        project(value, position, mapped);
        const full =
          mapped.length > 2
            ? decoder.decode(
                new Uint8Array(execution.memory.buffer, input + value, position - value),
              )
            : undefined;
        for (let j = 0; j < mapped.length; j += 2) {
          groups.push(mapped[j]!, mapped[j + 1]!, id);
          groupDepths.push(depth);
          values.push(full);
        }
      } else if (kind === 6 || kind === 7) {
        let resolved: { name: string; guest: Guest | undefined };
        if (kind === 6) {
          if (!embeds) staticEmbeds.set(guest, (embeds = []));
          let entry = embeds[value];
          if (!entry) {
            const name = guest.manifest.embeds[value]!;
            embeds[value] = entry = { name, guest: languages.get(name) };
          }
          resolved = entry;
        } else {
          const start = records[i + 2]!;
          const end = records[i + 3]!;
          const name = decoder.decode(
            new Uint8Array(execution.memory.buffer, input + start, end - start),
          );
          resolved = { name, guest: languages.get(name) };
          i += 2;
        }
        injections[id] = { name: resolved.name, guest: resolved.guest, pieces: [], targets: [] };
      } else throw new Error("Invalid record kind");
    }
    return injections;
  }

  function run(guest: Guest, documents: Document[], depth: number): void {
    if (depth >= 128) throw new ResourceError();
    let singleOffset: number | undefined;
    let singleCall: Call | undefined;
    if (depth > 0 && documents.every((document) => document.pieces.length === 2)) {
      singleOffset = execution.allocate(documents.length * 8);
      const words = new Uint32Array(execution.memory.buffer, singleOffset, documents.length * 2);
      for (let i = 0; i < documents.length; i++) {
        words[i * 2] = documents[i]!.pieces[0]!;
        words[i * 2 + 1] = documents[i]!.pieces[1]!;
      }
      singleCall = execution.call(guest, rootInput, sourceLength, singleOffset, documents.length);
      if (!singleCall.injections) {
        linkLeafBatch(singleCall, documents, depth);
        return;
      }
    }

    const { documentOffset, projections, length } = prepareDocuments(
      documents,
      depth,
      singleOffset,
    );
    const input = rootInput;
    const call =
      depth === 0
        ? rootCall
        : (singleCall ?? execution.call(guest, input, length, documentOffset, documents.length));
    const records = execution.words(call);
    const injections = scanRecords(
      guest,
      documents,
      depth,
      documentOffset,
      projections,
      call,
      records,
    );

    const batches = new Map<Guest, Document[]>();
    for (const injection of injections) {
      const child = injection.guest;
      if (!child) {
        noteMissing(injection.name);
        for (let i = 0; i < injection.targets.length; i++) {
          chunks[injection.targets[i]!]!.push(
            0,
            injection.pieces[i * 2 + 1]!,
            languages.missingStyle,
            0,
          );
        }
        continue;
      }
      if (!injection.pieces.length) continue;
      let batch = batches.get(child);
      if (!batch) batches.set(child, (batch = []));
      batch.push(injection);
    }
    for (const [child, batch] of batches) {
      run(child, batch, depth + 1);
    }
  }

  function emitSpans(): Session {
    let capacity = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i += 4) {
        if (chunk[i]! > 0) capacity += (chunk[i + 1]! - chunk[i]!) / 8;
        else if (chunk[i] === 0) capacity++;
      }
    }

    const offset = execution.allocate(capacity * 8, 4);
    const memory = new Uint32Array(execution.memory.buffer);
    const output = new Uint32Array(execution.memory.buffer, offset, capacity * 2);
    let used = 0;

    function emit(index: number): void {
      const chunk = chunks[index]!;
      for (let i = 0; i < chunk.length; i += 4) {
        const address = chunk[i]!;
        if (address < 0) {
          emit(-address);
          continue;
        }
        if (address === 0) {
          const end = chunk[i + 1]!;
          const style = chunk[i + 2]!;
          if (used && output[used - 1] === style) output[used - 2] = end;
          else {
            output[used++] = end;
            output[used++] = style;
          }
          continue;
        }
        const limit = chunk[i + 1]!;
        const delta = chunk[i + 2]!;
        const pieceEnd = chunk[i + 3]!;
        let start = address / 4;
        const end = limit / 4;
        if (delta === 0 && memory[end - 2]! <= pieceEnd) {
          if (used && output[used - 1] === memory[start + 1]) {
            output[used - 2] = memory[start]!;
            start += 2;
          }
          output.set(memory.subarray(start, end), used);
          used += end - start;
          continue;
        }
        for (let at = start; at < end; at += 2) {
          const end = Math.min(memory[at]!, pieceEnd) + delta;
          const style = memory[at + 1]!;
          if (used && output[used - 1] === style) output[used - 2] = end;
          else {
            output[used++] = end;
            output[used++] = style;
          }
        }
      }
    }

    emit(0);
    return {
      status: "ok",
      input: rootInput,
      length: sourceLength,
      spans: { offset, count: used / 2, injections: 0, groups: 0 },
      missing,
    };
  }

  function orderGroups(result: Session): void {
    if (!groups.length) return;

    const compare = (a: number, b: number) =>
      groups[a * 3]! - groups[b * 3]! ||
      groups[b * 3 + 1]! - groups[a * 3 + 1]! ||
      groupDepths[a]! - groupDepths[b]! ||
      b - a;
    let ordered = true;
    for (let i = 1; i < groups.length / 3; i++) {
      if (compare(i - 1, i) > 0) {
        ordered = false;
        break;
      }
    }
    const hasValues = values.some((value) => value !== undefined);
    if (ordered) {
      result.groups = Uint32Array.from(groups);
      if (hasValues) result.values = values;
    } else {
      const sorted = Array.from({ length: groups.length / 3 }, (_, i) => i).sort(compare);
      const output = new Uint32Array(groups.length);
      for (let i = 0; i < sorted.length; i++) {
        const index = sorted[i]! * 3;
        output[i * 3] = groups[index]!;
        output[i * 3 + 1] = groups[index + 1]!;
        output[i * 3 + 2] = groups[index + 2]!;
      }
      result.groups = output;
      if (hasValues) result.values = sorted.map((i) => values[i]);
    }
  }

  try {
    run(root, [{ pieces: [0, sourceLength], targets: [0] }], 0);
    const result = emitSpans();
    orderGroups(result);
    return result;
  } catch (error) {
    if (error instanceof ResourceError) return { status: "resource" };
    throw error;
  }
}
