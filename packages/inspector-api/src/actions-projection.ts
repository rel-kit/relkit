import { type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson } from "./shared.js";

/** Existing action-specific public redaction rules applied before receipts and audit evidence cross the boundary. */
export const ACTION_REDACTION = Object.freeze({
  redactKeys: [
    "handler",
    "handlerObject",
    "providerFile",
    "providerRoot",
    "stateRoot",
    "registry",
    "raw",
    "object",
  ],
});

/**
 * Selects administration status and receipt fields before applying action redaction.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public JSON with executable and private provider fields removed.
 */
export function projectAdmin(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const status = isRecord(value.status)
    ? pick(value.status, [
        "protocol",
        "version",
        "instanceId",
        "deliveryId",
        "eventInstanceId",
        "eventId",
        "triggerId",
        "cursor",
        "sequence",
        "state",
        "profile",
        "attempt",
        "acceptedAt",
        "order",
        "availableAt",
        "leaseExpiresAt",
        "idempotencyExpiresAt",
        "duplicate",
        "timestamp",
        "failure",
      ])
    : undefined;
  const record = isRecord(value.record)
    ? pick(value.record, [
        "protocol",
        "version",
        "actionId",
        "action",
        "instanceId",
        "deliveryId",
        "eventInstanceId",
        "triggerId",
        "mode",
        "outcome",
        "requestedAt",
        "fromState",
        "toState",
        "errorCode",
        "reason",
      ])
    : undefined;
  return {
    ...(status === undefined ? {} : { status: safeJson(status, ACTION_REDACTION) }),
    ...(record === undefined ? {} : { record: safeJson(record, ACTION_REDACTION) }),
    ...(typeof value.action === "string" ? { action: value.action } : {}),
  };
}

/**
 * Projects the declared approval identity and state without exposing native handlers.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted approval receipt.
 */
export function projectApproval(value: unknown): JsonValue {
  const approval = isRecord(value) ? value : {};
  return safeJson(
    pick(approval, [
      "invocationId",
      "toolCallId",
      "toolId",
      "state",
      "sideEffect",
      "policy",
      "required",
    ]),
    ACTION_REDACTION,
  );
}
