import { assertJsonValue, canonicalJson, isJsonValue, type JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { TASK_ITEM_MAX_BYTES } from "@relkit/jobs";
import { jobError } from "./support.js";

/** Validate stream identity, metadata and bounded JSON chunk content.
 * @param frame - Native frame to validate or encode.
 * @param runId - Selected run identifier.
 * @param name - Field, job or stream name.
 * @returns A frozen public stream frame matching the requested run and stream.
 * @example
 * const frame = projectStreamFrame({ kind: "chunk", runId: "run-1", name: "tokens",
 *   attempt: 1, generation: "gen-1", schemaVersion: "1", sequence: 0,
 *   item: { text: "hello" }, privateDebug: "omitted" }, "run-1", "tokens");
 * // frame contains the validated chunk and no privateDebug field.
 */
export function projectStreamFrame(
  frame: unknown,
  runId: string,
  name: string,
): NamedStreamFrame<JsonValue> {
  if (
    !isRecord(frame) ||
    frame.runId !== runId ||
    frame.name !== name ||
    !isStreamKind(frame.kind)
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream was not found.");
  }
  if (frame.kind === "chunk") {
    if (
      typeof frame.sequence !== "number" ||
      !Number.isSafeInteger(frame.sequence) ||
      !isJsonValue(frame.item)
    ) {
      throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream frame is invalid.");
    }
    assertJsonValue(frame.item);
    assertJsonSize(frame.item);
    return Object.freeze({
      kind: "chunk",
      runId,
      name,
      attempt: boundedNumber(frame.attempt),
      generation: boundedText(frame.generation),
      schemaVersion: boundedText(frame.schemaVersion),
      sequence: boundedNumber(frame.sequence),
      item: frame.item,
      ...(frame.cursor === undefined
        ? {}
        : { cursor: boundedText(frame.cursor, "stream cursor", 4096) }),
    });
  }
  const reason = frame.kind === "reset" ? streamResetReason(frame.reason) : undefined;
  return Object.freeze({
    kind: frame.kind,
    runId,
    name,
    attempt: boundedNumber(frame.attempt),
    generation: boundedText(frame.generation),
    schemaVersion: boundedText(frame.schemaVersion),
    ...(reason === undefined ? {} : { reason }),
  }) as NamedStreamFrame<JsonValue>;
}

/** Recognize the supported named stream lifecycle frame kinds.
 * @param value - Value to validate or project.
 * @returns Whether the kind is start, chunk, reset or end.
 */
function isStreamKind(value: unknown): value is NamedStreamFrame["kind"] {
  return value === "start" || value === "chunk" || value === "reset" || value === "end";
}

/** Require nonempty metadata within the supplied UTF-8 byte bound.
 * @param value - Value to validate or project.
 * @param name - Field, job or stream name.
 * @param maxBytes - Maximum encoded UTF-8 byte length.
 * @returns The validated text; unsupported metadata throws a public job error.
 */
function boundedText(value: unknown, name = "stream frame text", maxBytes = 256): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > maxBytes
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", `Job ${name} is invalid.`);
  }
  return value;
}

/** Require a nonnegative safe integer for stream counters.
 * @param value - Value to validate or project.
 * @returns The validated integer.
 */
function boundedNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream frame is invalid.");
  }
  return value as number;
}

/** Validate a supported stream reset reason.
 * @param value - Value to validate or project.
 * @returns The reconnect, expired-cursor or overflow reason.
 */
function streamResetReason(value: unknown): "reconnected" | "cursor-expired" | "overflow" {
  if (value !== "reconnected" && value !== "cursor-expired" && value !== "overflow") {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream frame is invalid.");
  }
  return value;
}

/** Enforce the canonical JSON byte limit for one stream item.
 * @param value - Value to validate or project.
 * @returns Nothing for a bounded item; otherwise throws an access-denied error.
 */
function assertJsonSize(value: JsonValue): void {
  try {
    if (new TextEncoder().encode(canonicalJson(value)).byteLength > TASK_ITEM_MAX_BYTES) {
      throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream item is too large.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Job stream item is too large.") throw error;
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream item is invalid.");
  }
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
