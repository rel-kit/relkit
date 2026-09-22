import type {
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunRetryReceipt,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import { assertJobsCapability, JobsCapabilityError } from "./capabilities.js";
import type { OperationContext } from "./adapter.js";
import { durationToMillis, type DurationInput } from "./duration.js";
import type { JobsRuntime } from "./runtime.js";

export { observeWithTimeout } from "./control-observe.js";

export interface JobObserveOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: DurationInput;
}

export function operationContext(
  runtime: JobsRuntime,
  signal: AbortSignal | undefined,
  operationId?: string,
): OperationContext {
  return runtime.operationContext({
    signal: signal ?? new AbortController().signal,
    ...(operationId === undefined ? {} : { operationId }),
  });
}

export function requireMethod(
  runtime: JobsRuntime,
  capability: string,
  method: keyof JobsRuntime["adapter"],
): void {
  if (typeof runtime.adapter[method] !== "function") throw new JobsCapabilityError(capability);
  if (runtime.capabilities.features[capability] === false)
    throw new JobsCapabilityError(capability);
  if (
    runtime.capabilities.capabilities?.[capability] !== undefined ||
    runtime.capabilities.features[capability] === true
  ) {
    assertJobsCapability(runtime.capabilities, capability);
  }
}

export function requireOperationId(value: string): void {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    new TextEncoder().encode(value).byteLength > 256
  ) {
    throw new TypeError("operationId must be a bounded non-empty string");
  }
}

export function isTerminal(run: RunSnapshot): boolean {
  return (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.status === "timed-out"
  );
}

export function normalizeCancellationReceipt(
  value: unknown,
  runId: string,
  operationId: string,
): RunCancellationReceipt {
  if (
    !isRecord(value) ||
    value.runId !== runId ||
    value.operationId !== operationId ||
    !isCancellationOutcome(value.outcome)
  ) {
    throw new TypeError("Native cancel receipt is invalid");
  }
  if (value.requestedAt !== undefined && typeof value.requestedAt !== "string") {
    throw new TypeError("Native cancel receipt timestamp is invalid");
  }
  if (value.run !== undefined && !isRecord(value.run))
    throw new TypeError("Native cancel receipt run is invalid");
  return Object.freeze({
    runId,
    operationId,
    outcome: value.outcome,
    ...(value.requestedAt === undefined ? {} : { requestedAt: value.requestedAt }),
    ...(value.run === undefined ? {} : { run: value.run as unknown as RunSnapshot }),
  });
}

export function normalizeRetryReceipt(value: unknown, originalRunId: string): RunRetryReceipt {
  if (!isRecord(value) || value.accepted !== true || value.retryOfRunId !== originalRunId) {
    throw new TypeError("Native retry receipt is invalid");
  }
  const fields = ["runId", "jobId", "taskId", "taskVersion", "acceptedAt"] as const;
  if (fields.some((field) => typeof value[field] !== "string" || value[field] === "")) {
    throw new TypeError("Native retry receipt is missing durable identity");
  }
  if (value.runId === originalRunId)
    throw new TypeError("Native retry receipt did not create a new run");
  return Object.freeze({
    accepted: true,
    runId: value.runId as string,
    jobId: value.jobId as string,
    taskId: value.taskId as string,
    taskVersion: value.taskVersion as string,
    acceptedAt: value.acceptedAt as string,
    retryOfRunId: originalRunId,
    ...(value.duplicate === true ? { duplicate: true } : {}),
    ...(typeof value.idempotencyExpiresAt === "string"
      ? { idempotencyExpiresAt: value.idempotencyExpiresAt }
      : {}),
  });
}

export function isUnknown(value: unknown): value is {
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly outcome: "unknown";
  readonly recovery?: JobUnknownOutcome["recovery"];
} {
  return isRecord(value) && value.outcome === "unknown" && typeof value.operationId === "string";
}

function isCancellationOutcome(value: unknown): value is RunCancellationReceipt["outcome"] {
  return value === "requested" || value === "already-terminal" || value === "unsupported";
}

export function unknownKey(value: unknown): string | undefined {
  return isRecord(value) && typeof value.idempotencyKey === "string"
    ? value.idempotencyKey
    : undefined;
}

export function unknownRecovery(value: unknown): JobUnknownOutcome["recovery"] | undefined {
  const recovery = isRecord(value) && isRecord(value.recovery) ? value.recovery : undefined;
  if (recovery === undefined || typeof recovery.action !== "string") return undefined;
  if (
    recovery.action !== "retry-with-same-key" &&
    recovery.action !== "inspect-native" &&
    recovery.action !== "unavailable"
  ) {
    return undefined;
  }
  return {
    action: recovery.action,
    ...(typeof recovery.expiresAt === "string" ? { expiresAt: recovery.expiresAt } : {}),
  };
}

export function observerTimeout(runtime: JobsRuntime, authored?: DurationInput): number {
  const timeoutMs =
    authored === undefined
      ? (runtime.capabilities.limits?.readTimeoutMs ?? 10_000)
      : durationToMillis(authored);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) {
    throw new RangeError("Observer timeout must be positive and no greater than 10 seconds");
  }
  return timeoutMs;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
