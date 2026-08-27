import { type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson } from "./shared.js";

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
