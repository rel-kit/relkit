/**
 * Applies deterministic oldest-first retention to already redacted records.
 * This pure policy counts UTF-8 bytes, retains cumulative loss outside the queue,
 * and does not acquire clocks, persistence, exporters or runtime resources.
 */
import type { EarlyRetentionState, EarlyRetainedRecord } from "./early-records.types.js";

/** Empty state created separately for every acquired session Layer. */
export const emptyEarlyRetention = (): EarlyRetentionState => ({
  entries: [],
  bytes: 0,
  sequence: 0,
  acknowledged: 0,
  droppedRecords: 0,
  droppedBytes: 0,
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
  if (entry.bytes > maxBytes)
    return {
      ...state,
      sequence: entry.sequence,
      droppedRecords: state.droppedRecords + 1,
      droppedBytes: state.droppedBytes + entry.bytes,
    };
  const entries = [...state.entries, entry];
  let bytes = state.bytes + entry.bytes;
  let droppedRecords = state.droppedRecords;
  let droppedBytes = state.droppedBytes;
  while (entries.length > maxRecords || bytes > maxBytes) {
    const oldest = entries.shift();
    if (oldest === undefined) break;
    bytes -= oldest.bytes;
    droppedRecords += 1;
    droppedBytes += oldest.bytes;
  }
  return { ...state, entries, bytes, sequence: entry.sequence, droppedRecords, droppedBytes };
}

/** Applies new bounds immediately, evicting the oldest retained records as loss. */
export function resizeEarlyRetention(
  state: EarlyRetentionState,
  maxRecords: number,
  maxBytes: number,
): EarlyRetentionState {
  const entries = [...state.entries];
  let bytes = state.bytes;
  let droppedRecords = state.droppedRecords;
  let droppedBytes = state.droppedBytes;
  while (entries.length > maxRecords || bytes > maxBytes) {
    const oldest = entries.shift();
    if (oldest === undefined) break;
    bytes -= oldest.bytes;
    droppedRecords += 1;
    droppedBytes += oldest.bytes;
  }
  return { ...state, entries, bytes, droppedRecords, droppedBytes };
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
