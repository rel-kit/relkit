import { rm } from "node:fs/promises";
import type { ObservabilityRetentionReport } from "./index-types.js";
import { removeEntry, stats } from "./index-memory.js";
import type { IndexConfig, IndexState, MutableSegment } from "./index-state.js";

export async function enforceRetention(
  root: string,
  state: IndexState,
  config: IndexConfig,
): Promise<ObservabilityRetentionReport> {
  const now = config.now();
  if (!Number.isFinite(now)) throw new TypeError("Retention clock value is invalid");
  const cutoff = now - config.maxAgeMs;
  const remove = new Set<string>();
  for (const segment of state.segments.values()) {
    if (!segment.active && segment.newest < cutoff) remove.add(segment.path);
  }
  let bytes = stats(state).bytes;
  while (bytes > config.maxBytes) {
    const candidate = oldestRemovable(state.segments, remove);
    if (candidate === undefined) break;
    remove.add(candidate.path);
    bytes -= candidate.bytes;
  }
  let removedRecords = 0;
  let removedBytes = 0;
  for (const path of remove) {
    const segment = state.segments.get(path);
    if (segment === undefined) continue;
    await rm(path, { force: true });
    removedRecords += segment.entries.size;
    removedBytes += segment.bytes;
    for (const cursor of segment.entries) removeEntry(state, root, cursor);
    state.segments.delete(path);
  }
  return { removedSegments: remove.size, removedRecords, removedBytes };
}

function oldestRemovable(
  segments: Map<string, MutableSegment>,
  excluded: Set<string>,
): MutableSegment | undefined {
  let oldest: MutableSegment | undefined;
  for (const segment of segments.values()) {
    if (segment.active || excluded.has(segment.path)) continue;
    if (oldest === undefined || segment.oldest < oldest.oldest) oldest = segment;
  }
  return oldest;
}
