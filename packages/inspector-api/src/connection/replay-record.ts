/** Shares the persistence envelope with capture accounting without importing native storage. */
import type { EarlyRetainedRecord } from "@relkit/observability/early";
import type { LocalRecord } from "@relkit/observability/local/record";

/**
 * Assigns one session/sequence receipt while preserving the original record and origin.
 * @param sessionId - Authenticated fixed-length UUID session identity.
 * @param entry - Validated redacted record and its monotonic sequence.
 * @returns The exact lightweight envelope measured before transport and committed by the tool.
 */
export function inspectionReplayRecord(
  sessionId: string,
  entry: Omit<EarlyRetainedRecord, "bytes">,
): LocalRecord {
  return {
    key: `${sessionId}:${entry.sequence}`,
    origin: entry.identity?.origin ?? "application",
    record: entry.record,
  };
}
