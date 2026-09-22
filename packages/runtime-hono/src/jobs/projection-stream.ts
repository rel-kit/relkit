import { assertJsonValue, canonicalJson, isJsonValue, type JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { TASK_ITEM_MAX_BYTES } from "@relkit/jobs";
import { jobError } from "./support.js";

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

function isStreamKind(value: unknown): value is NamedStreamFrame["kind"] {
  return value === "start" || value === "chunk" || value === "reset" || value === "end";
}

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

function boundedNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream frame is invalid.");
  }
  return value as number;
}

function streamResetReason(value: unknown): "reconnected" | "cursor-expired" | "overflow" {
  if (value !== "reconnected" && value !== "cursor-expired" && value !== "overflow") {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job stream frame is invalid.");
  }
  return value;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
