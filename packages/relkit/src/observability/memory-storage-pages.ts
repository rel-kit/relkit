/**
 * Pages the runtime's bounded memory using the existing query-index protocol.
 * Trace representatives follow the persisted request/trace/span priority rule.
 */
import type { MemoryStorageState } from "./memory-storage.types.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPageOptions,
} from "./storage/index.types.js";
import { matches, parseCursor } from "./storage/index-state-core.js";

/**
 * Reads one cursor page from the retained in-memory record snapshot.
 * @param state - Acquired memory state.
 * @param options - Query-index filters and paging controls.
 * @param traces - Whether to select one representative per trace.
 * @returns A bounded index page without reading a filesystem.
 */
export function memoryStoragePage(
  state: MemoryStorageState,
  options: ObservabilityIndexPageOptions = {},
  traces = false,
) {
  const entries = [...state.records.values()].map((item) => item.entry);
  const candidates = traces
    ? traceRepresentatives(entries, options)
    : entries.filter((entry) => matches(entry, options));
  const descending = options.order === "desc";
  const after = options.cursor === undefined ? undefined : parseCursor(options.cursor);
  const ordered = candidates.filter(
    (entry) =>
      after === undefined ||
      (descending ? Number(entry.cursor) < after : Number(entry.cursor) > after),
  );
  if (descending) ordered.reverse();
  const limit = options.limit ?? 100;
  const page = ordered.slice(0, limit);
  const nextCursor = ordered.length > limit ? page.at(-1)?.cursor : undefined;
  return { entries: page, ...(nextCursor === undefined ? {} : { nextCursor }) };
}

/**
 * Chooses current trace representatives after identifying matching trace IDs.
 * @param entries - Retained entries in ascending cursor order.
 * @param options - Filters that determine matching trace identities.
 * @returns One request, trace, or span entry for each matching identity.
 */
function traceRepresentatives(
  entries: readonly ObservabilityIndexEntry[],
  options: ObservabilityIndexPageOptions,
) {
  const matching = new Set(
    entries.filter((entry) => matches(entry, options)).map((entry) => entry.traceId),
  );
  const representatives = new Map<string, ObservabilityIndexEntry>();
  for (const entry of entries) {
    if (
      !entry.traceId ||
      !matching.has(entry.traceId) ||
      !["request", "trace", "span"].includes(entry.signal)
    )
      continue;
    const current = representatives.get(entry.traceId);
    if (!current || priority(entry) >= priority(current)) representatives.set(entry.traceId, entry);
  }
  return [...representatives.values()].sort(
    (left, right) => Number(left.cursor) - Number(right.cursor),
  );
}

/** @param entry - Trace contributor. @returns Existing request/trace/span preference. */
function priority(entry: ObservabilityIndexEntry): number {
  if (entry.signal === "request") return 3;
  if (entry.signal === "trace") return 2;
  return 1;
}
