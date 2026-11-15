/**
 * Applies deterministic retention to already redacted records: a full buffer gives up whole
 * records of the lowest value first, oldest first within a kind (`early-records-priority.ts`).
 * This pure policy counts UTF-8 bytes, retains cumulative loss by kind outside the queue,
 * and does not acquire clocks, persistence, exporters or runtime resources.
 */
import type {
  EarlyLossKind,
  EarlyRetentionState,
  EarlyRetainedRecord,
} from "./early-records.types.js";
import { earlyEvictionIndex, earlyLossKind, noEarlyLoss } from "./early-records-priority.js";

/** Empty state created separately for every acquired session Layer. */
export const emptyEarlyRetention = (): EarlyRetentionState => ({
  entries: [],
  bytes: 0,
  sequence: 0,
  acknowledged: 0,
  droppedRecords: 0,
  droppedBytes: 0,
  droppedByKind: noEarlyLoss(),
  reportedRecords: 0,
  reportedBytes: 0,
});

/**
 * Retains one safe record or counts its complete encoded size as lost.
 * @param state - Session state before admission.
 * @param entry - Redacted record with its new monotonic sequence.
 * @param maxRecords - Validated positive count bound.
 * @param maxBytes - Validated positive encoded-byte bound.
 * @returns New state with deterministic oldest-record eviction.
 */
export function retainEarlyRecord(
  state: EarlyRetentionState,
  entry: EarlyRetainedRecord,
  maxRecords: number,
  maxBytes: number,
): EarlyRetentionState {
  const kind = entry.kind ?? earlyLossKind(entry.record);
  // Reserve collection metadata and its separator inside the one-MiB transport ceiling.
  if (entry.bytes > maxBytes || entry.bytes + 1025 > 1_048_576)
    return {
      ...state,
      sequence: entry.sequence,
      droppedRecords: state.droppedRecords + 1,
      droppedBytes: state.droppedBytes + entry.bytes,
      droppedByKind: { ...state.droppedByKind, [kind]: state.droppedByKind[kind] + 1 },
    };
  const admitted = { ...state, sequence: entry.sequence };
  return evictToFit(
    admitted,
    [...state.entries, entry.kind === undefined ? { ...entry, kind } : entry],
    state.bytes + entry.bytes,
    maxRecords,
    maxBytes,
  );
}

/** Applies new bounds immediately, giving up retained records by priority as loss. */
export function resizeEarlyRetention(
  state: EarlyRetentionState,
  maxRecords: number,
  maxBytes: number,
): EarlyRetentionState {
  return evictToFit(state, [...state.entries], state.bytes, maxRecords, maxBytes);
}

/** Gives up records by priority until the bounds hold; `entries` is owned by the caller. */
function evictToFit(
  state: EarlyRetentionState,
  entries: EarlyRetainedRecord[],
  retainedBytes: number,
  maxRecords: number,
  maxBytes: number,
): EarlyRetentionState {
  let bytes = retainedBytes;
  let droppedRecords = state.droppedRecords;
  let droppedBytes = state.droppedBytes;
  let droppedByKind: Record<EarlyLossKind, number> | undefined;
  while (entries.length > maxRecords || bytes > maxBytes) {
    const index = earlyEvictionIndex(entries);
    if (index < 0) break;
    const [victim] = entries.splice(index, 1);
    bytes -= victim!.bytes;
    droppedRecords += 1;
    droppedBytes += victim!.bytes;
    droppedByKind ??= { ...state.droppedByKind };
    const kind = victim!.kind ?? earlyLossKind(victim!.record);
    droppedByKind[kind] += 1;
  }
  return {
    ...state,
    entries,
    bytes,
    droppedRecords,
    droppedBytes,
    droppedByKind: droppedByKind ?? state.droppedByKind,
  };
}

/**
 * Retires an ordered prefix without resetting evidence of prior loss.
 * @param state - Current session state, including later concurrent arrivals.
 * @param through - Validated sequence from this session's persistence handoff.
 * @returns New state retaining every record after the acknowledgement fence.
 */
export function acknowledgeEarlyRecords(
  state: EarlyRetentionState,
  through: number,
): EarlyRetentionState {
  const entries = state.entries.filter((entry) => entry.sequence > through);
  return {
    ...state,
    entries,
    acknowledged: Math.max(state.acknowledged, through),
    bytes: entries.reduce((bytes, entry) => bytes + entry.bytes, 0),
  };
}
