import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  isUnknown,
  isUnknownEffect,
  normalizeCancellationReceipt,
  normalizeCancellationReceiptEffect,
  normalizeRetryReceipt,
  normalizeRetryReceiptEffect,
  unknownKey,
  unknownKeyEffect,
  unknownRecovery,
  unknownRecoveryEffect,
} from "../src/control-support-receipts.ts";
import { ControlSupportFailure } from "../src/control-support-run.ts";

test("native control receipts are validated and frozen through Effect", () => {
  const cancel = { runId: "run-1", operationId: "cancel-1", outcome: "requested" };
  const normalized = Effect.runSync(
    normalizeCancellationReceiptEffect(cancel, "run-1", "cancel-1"),
  );
  expect(normalized).toEqual(cancel);
  expect(Object.isFrozen(normalized)).toBe(true);
  expect(normalizeCancellationReceipt(cancel, "run-1", "cancel-1")).toEqual(normalized);

  const retry = {
    accepted: true,
    runId: "run-2",
    jobId: "job",
    taskId: "task",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    retryOfRunId: "run-1",
  };
  const normalizedRetry = Effect.runSync(normalizeRetryReceiptEffect(retry, "run-1"));
  expect(normalizedRetry).toEqual(retry);
  expect(Object.isFrozen(normalizedRetry)).toBe(true);
  expect(normalizeRetryReceipt(retry, "run-1")).toEqual(normalizedRetry);

  const invalid = Effect.runSync(
    Effect.result(normalizeCancellationReceiptEffect(cancel, "other", "cancel-1")),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(ControlSupportFailure);
  expect(() => normalizeCancellationReceipt(cancel, "other", "cancel-1")).toThrow(TypeError);
  expect(() => normalizeRetryReceipt(retry, "run-2")).toThrow(TypeError);
});

test("uncertain control outcomes expose bounded recovery metadata", () => {
  const value = {
    outcome: "unknown",
    operationId: "cancel-1",
    idempotencyKey: "same-key",
    recovery: { action: "inspect-native", expiresAt: "2026-01-02T00:00:00.000Z" },
  };
  expect(Effect.runSync(isUnknownEffect(value))).toBe(true);
  expect(isUnknown(value)).toBe(true);
  expect(Effect.runSync(unknownKeyEffect(value))).toBe("same-key");
  expect(unknownKey(value)).toBe("same-key");
  expect(Effect.runSync(unknownRecoveryEffect(value))).toEqual(value.recovery);
  expect(unknownRecovery(value)).toEqual(value.recovery);
  expect(isUnknown({ outcome: "unknown" })).toBe(false);
  expect(unknownKey({ idempotencyKey: 3 })).toBeUndefined();
  expect(unknownRecovery({ recovery: { action: "unsafe" } })).toBeUndefined();
});
