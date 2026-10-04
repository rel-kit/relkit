import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import { candidates, isRecord } from "./pending-support.js";
/**
 * Extracts recognized recovery authority without manufacturing successful outcomes.
 * @param value - Original rejected transport value.
 * @returns The original unknown-outcome envelope, when recognized.
 */
export function jobUnknownOutcome(value: unknown): JobUnknownOutcome | undefined {
  for (const candidate of candidates(value)) {
    if (
      isRecord(candidate) &&
      candidate.outcome === "unknown" &&
      (candidate.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
        candidate.code === "RELKIT_JOB_CONTROL_UNKNOWN") &&
      typeof candidate.operationId === "string" &&
      isRecord(candidate.recovery) &&
      (candidate.recovery.action === "retry-with-same-key" ||
        candidate.recovery.action === "inspect-native" ||
        candidate.recovery.action === "unavailable")
    )
      return candidate as unknown as JobUnknownOutcome;
  }
  return undefined;
}
