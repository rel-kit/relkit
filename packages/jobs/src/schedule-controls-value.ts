import type { ScheduleReadReceipt } from "./job.types.js";
import type { UnknownControlOutcome } from "./control-support.types.js";
/** Freezes a valid native schedule read receipt.
 * @param value - Provider response.
 * @returns An immutable read receipt.
 * @throws TypeError for an unrecognized outcome.
 * @example normalizeRead({ outcome: "unavailable" });
 */
export function normalizeRead(value: unknown): ScheduleReadReceipt {
  if (!isRecord(value) || (value.outcome !== "available" && value.outcome !== "unavailable")) {
    throw new TypeError("Native schedule read receipt is invalid");
  }
  return Object.freeze(value as unknown as ScheduleReadReceipt);
}
/** Checks the known native schedule write outcomes.
 * @param value - Provider outcome.
 * @returns True for a supported write outcome.
 * @example isOutcome("paused");
 */
export function isOutcome(value: unknown): boolean {
  return (
    value === "created" ||
    value === "updated" ||
    value === "paused" ||
    value === "resumed" ||
    value === "deleted" ||
    value === "requested" ||
    value === "unsupported"
  );
}
/** Recognizes an uncertain native schedule write for recovery.
 * @param value - Provider response.
 * @returns True when an operation ID and unknown outcome are present.
 * @example isUnknown({ operationId: "op", outcome: "unknown" });
 */
export function isUnknown(value: unknown): value is UnknownControlOutcome {
  return isRecord(value) && value.outcome === "unknown" && typeof value.operationId === "string";
}
/** Tests for a nonarray native response record.
 * @param value - Candidate provider response.
 * @returns True for a nonarray object.
 * @example isRecord({ outcome: "available" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Validates schedule and operation identifiers against the byte limit.
 * @param value - Candidate identifier.
 * @returns The bounded nonempty identifier.
 * @throws TypeError for missing or oversized identifiers.
 * @example boundedId("hourly");
 */
export function boundedId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 256
  )
    throw new TypeError("Schedule identifiers must be bounded non-empty strings");
  return value;
}
/** Validates a native schedule pagination cursor byte limit.
 * @param value - Candidate cursor.
 * @returns The cursor when it fits.
 * @throws RangeError when the cursor exceeds 4096 UTF-8 bytes.
 * @example boundedCursor("next-page");
 */
export function boundedCursor(value: string): string {
  if (new TextEncoder().encode(value).byteLength > 4096)
    throw new RangeError("Schedule cursor is too large");
  return value;
}
/** Creates a nonaborted signal when a caller did not supply one.
 * @returns A fresh idle signal.
 * @example idleSignal().aborted;
 */
export function idleSignal(): AbortSignal {
  return new AbortController().signal;
}
