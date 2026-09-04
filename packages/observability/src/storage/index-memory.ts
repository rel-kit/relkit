import { relativeSegmentPath, type SegmentLine, type SegmentScan } from "./index-files.js";
import {
  assertEntry,
  boundedLimit,
  makeEntry,
  matches,
  parseCursor,
  safeSegmentPath,
  timestampMs,
  type IndexConfig,
  type IndexState,
  type MutableSegment,
} from "./index-state.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPage,
  ObservabilityIndexPageOptions,
  ObservabilityIndexStats,
} from "./index-types.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";

export function addSegment(state: IndexState, value: SegmentScan): MutableSegment {
  const existing = state.segments.get(value.path);
  if (existing !== undefined) {
    existing.active = value.active;
    existing.bytes = Math.max(existing.bytes, value.bytes);
    return existing;
  }
  const segment: MutableSegment = {
    path: value.path,
    active: value.active,
    bytes: value.bytes,
    oldest: Number.POSITIVE_INFINITY,
    newest: Number.NEGATIVE_INFINITY,
    entries: new Set(),
  };
  state.segments.set(value.path, segment);
  return segment;
}

export function addLine(state: IndexState, root: string, line: SegmentLine): void {
  addRecord(state, root, line.record, line.segment.path, line.offset, line.bytes, false);
}

export function addRecord(
  state: IndexState,
  root: string,
  record: RedactedObservabilityRecord,
  path: string,
  offset: number,
  bytes: number,
  countBytes = true,
): ObservabilityIndexEntry {
  assertEntry(record, offset, bytes);
  const segment =
    state.segments.get(path) ??
    addSegment(state, {
      path,
      directory: "traces",
      active: path.endsWith(".active.ndjson"),
      bytes: 0,
    });
  const location = `${path}:${offset}`;
  const previous = state.locations.get(location);
  if (previous !== undefined) removeEntry(state, root, previous);
  const entry = makeEntry(record, relativeSegmentPath(root, path), offset, bytes, ++state.sequence);
  state.records.set(entry.cursor, entry);
  indexEntry(state, entry);
  state.locations.set(location, entry.cursor);
  segment.entries.add(entry.cursor);
  if (countBytes) segment.bytes += bytes;
  const timestamp = timestampMs(entry.timestamp);
  if (timestamp !== undefined) {
    segment.oldest = Math.min(segment.oldest, timestamp);
    segment.newest = Math.max(segment.newest, timestamp);
  }
  return entry;
}

export function renameSegment(
  state: IndexState,
  root: string,
  activePath: string,
  finalPath: string,
): void {
  const segment = state.segments.get(activePath);
  if (segment === undefined) return;
  state.segments.delete(activePath);
  segment.path = finalPath;
  segment.active = false;
  state.segments.set(finalPath, segment);
  for (const cursor of segment.entries) {
    const entry = state.records.get(cursor);
    if (entry !== undefined) {
      state.records.set(
        cursor,
        Object.freeze({ ...entry, segment: relativeSegmentPath(root, finalPath) }),
      );
    }
  }
}

export function readPage(
  state: IndexState,
  config: IndexConfig,
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  const limit = boundedLimit(options.limit, config.pageSize, config.pageSize);
  const descending = options.order === "desc";
  const after =
    options.cursor === undefined ? (descending ? Infinity : 0) : parseCursor(options.cursor);
  const entries: ObservabilityIndexEntry[] = [];
  let nextCursor: string | undefined;
  const indexed = (["requestId", "originRequestId", "traceId", "spanId"] as const)
    .flatMap((field) =>
      options[field] === undefined
        ? []
        : [state.fields[field].get(options[field]!) ?? new Set<string>()],
    )
    .sort((left, right) => left.size - right.size)[0];
  const values = [
    ...(indexed === undefined
      ? state.records.values()
      : [...indexed].flatMap((cursor) => state.records.get(cursor) ?? [])),
  ];
  values.sort((left, right) => Number(left.cursor) - Number(right.cursor));
  if (descending) values.reverse();
  for (const entry of values) {
    if (
      (descending ? Number(entry.cursor) >= after : Number(entry.cursor) <= after) ||
      !matches(entry, options)
    )
      continue;
    if (entries.length < limit) entries.push(entry);
    else {
      nextCursor = entries[entries.length - 1]?.cursor;
      break;
    }
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export function removeEntry(state: IndexState, root: string, cursor: string): void {
  const entry = state.records.get(cursor);
  if (entry === undefined) return;
  state.records.delete(cursor);
  unindexEntry(state, entry);
  state.locations.delete(`${safeSegmentPath(root, entry.segment)}:${entry.offset}`);
  state.segments.get(safeSegmentPath(root, entry.segment))?.entries.delete(cursor);
}

function indexEntry(state: IndexState, entry: ObservabilityIndexEntry): void {
  for (const field of ["requestId", "originRequestId", "traceId", "spanId"] as const) {
    const value = entry[field];
    if (value === undefined) continue;
    const cursors = state.fields[field].get(value) ?? new Set<string>();
    cursors.add(entry.cursor);
    state.fields[field].set(value, cursors);
  }
}

function unindexEntry(state: IndexState, entry: ObservabilityIndexEntry): void {
  for (const field of ["requestId", "originRequestId", "traceId", "spanId"] as const) {
    const value = entry[field];
    if (value === undefined) continue;
    const cursors = state.fields[field].get(value);
    cursors?.delete(entry.cursor);
    if (cursors?.size === 0) state.fields[field].delete(value);
  }
}

export function trimEntries(state: IndexState, root: string, maxEntries: number): void {
  while (state.records.size > maxEntries) {
    const oldest = state.records.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    removeEntry(state, root, oldest);
  }
}

export function stats(state: IndexState): ObservabilityIndexStats {
  let bytes = 0;
  for (const segment of state.segments.values()) bytes += segment.bytes;
  return { records: state.records.size, segments: state.segments.size, bytes };
}
