/**
 * Supplies bounded, queryable application memory without creating local history.
 * The runtime owns this handle and may instead receive an explicit storage adapter.
 */
import { createObservabilityQuery } from "./query.js";
import { makeEntry } from "./storage/index-state-core.js";
import { memoryStoragePage } from "./memory-storage-pages.js";
import type { MemoryStorageState } from "./memory-storage.types.js";
import type { ObservabilityRuntimeStorage } from "./runtime-storage.types.js";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPageOptions,
} from "./storage/index.types.js";

/**
 * Allocates one count- and byte-bounded store for an application runtime.
 * @param options - Validated runtime capture and retention policy.
 * @returns An owned memory handle with the normal query protocol.
 */
export function createMemoryRuntimeStorage(
  options: ObservabilityRuntimeOptions,
): ObservabilityRuntimeStorage {
  const policy = options.configuration?.localRetention;
  const maximum = Math.min(
    options.maxRecords ?? policy?.maxRecords ?? 1024,
    policy?.maxEntries ?? 8192,
  );
  const maxBytes = policy?.maxBytes ?? 4 * 1024 * 1024;
  const state: MemoryStorageState = { records: new Map(), sequence: 0, bytes: 0 };
  const index = {
    page: (input: ObservabilityIndexPageOptions = {}) => memoryStoragePage(state, input),
    tracePage: (input: ObservabilityIndexPageOptions = {}) => memoryStoragePage(state, input, true),
    read: async (entry: ObservabilityIndexEntry) => state.records.get(entry.cursor)?.record,
  };
  const query = createObservabilityQuery(index, options);
  return {
    query,
    append: async (record) => {
      const bytes = Buffer.byteLength(JSON.stringify(record));
      const entry = makeEntry(record, "memory", 0, bytes, ++state.sequence);
      state.records.set(entry.cursor, { entry, record });
      state.bytes += bytes;
      retainMemory(state, maximum, maxBytes, policy?.maxAgeMs);
      return record;
    },
    flush: async () => retainMemory(state, maximum, maxBytes, policy?.maxAgeMs),
    close: async () => {
      state.records.clear();
      state.bytes = 0;
    },
  };
}

/**
 * Evicts oldest observations until all configured memory limits hold.
 * @param state - Store-owned record and byte accounting.
 * @param maximum - Maximum retained records.
 * @param maxBytes - Maximum encoded payload bytes.
 * @param maxAgeMs - Optional explicitly configured age limit.
 * @returns Nothing after deterministic oldest-first eviction.
 */
function retainMemory(
  state: MemoryStorageState,
  maximum: number,
  maxBytes: number,
  maxAgeMs?: number,
): void {
  const oldest = maxAgeMs === undefined ? undefined : Date.now() - maxAgeMs;
  for (const [cursor, item] of state.records) {
    const expired = oldest !== undefined && Date.parse(item.entry.timestamp) < oldest;
    if (!expired && state.records.size <= maximum && state.bytes <= maxBytes) continue;
    state.records.delete(cursor);
    state.bytes -= item.entry.bytes;
  }
}
