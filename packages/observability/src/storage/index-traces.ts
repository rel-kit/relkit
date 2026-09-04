import {
  boundedLimit,
  matches,
  parseCursor,
  type IndexConfig,
  type IndexState,
} from "./index-state.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPage,
  ObservabilityIndexPageOptions,
} from "./index-types.js";

export function readTracePage(
  state: IndexState,
  config: IndexConfig,
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  const limit = boundedLimit(options.limit, config.pageSize, config.pageSize);
  const descending = options.order === "desc";
  const after =
    options.cursor === undefined ? (descending ? Infinity : 0) : parseCursor(options.cursor);
  const traceIds = new Set(
    [...state.records.values()]
      .filter((entry) => traceEntry(entry) && matches(entry, options))
      .map((entry) => entry.traceId!),
  );
  const representatives = new Map<string, ObservabilityIndexEntry>();
  for (const entry of state.records.values()) {
    if (!traceEntry(entry) || !traceIds.has(entry.traceId!)) continue;
    const current = representatives.get(entry.traceId!);
    if (current === undefined || better(entry, current)) representatives.set(entry.traceId!, entry);
  }
  const values = [...representatives.values()]
    .filter((entry) => (descending ? Number(entry.cursor) < after : Number(entry.cursor) > after))
    .sort((left, right) => Number(left.cursor) - Number(right.cursor));
  if (descending) values.reverse();
  const entries = values.slice(0, limit);
  return Object.freeze({
    entries: Object.freeze(entries),
    ...(values.length <= limit ? {} : { nextCursor: entries.at(-1)!.cursor }),
  });
}

function traceEntry(entry: ObservabilityIndexEntry): boolean {
  return (
    entry.traceId !== undefined &&
    (entry.signal === "request" || entry.signal === "trace" || entry.signal === "span")
  );
}

function better(next: ObservabilityIndexEntry, current: ObservabilityIndexEntry): boolean {
  return (
    priority(next) > priority(current) ||
    (priority(next) === priority(current) && Number(next.cursor) > Number(current.cursor))
  );
}

function priority(entry: ObservabilityIndexEntry): number {
  return entry.signal === "request" ? 3 : entry.signal === "trace" ? 2 : 1;
}
