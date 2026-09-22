import { canonicalJson, type JsonValue, type TracePropagation } from "@relkit/contracts";
import type { JobUnknownOutcome, RunHandle } from "@relkit/contracts/jobs";
import {
  currentInvocationScope,
  currentTaskAncestry,
  currentTracePropagation,
} from "@relkit/invocation";
import type { JobsAdapterRuntime, OperationContext, NativeReceipt } from "./adapter.js";
import { durationToMillis } from "./duration.js";
import {
  JobReceiptError,
  JobSubmissionCancelledError,
  JobSubmissionError,
  JobSubmissionUnknownError,
} from "./submission-errors.js";
import type { TaskSubmissionMetadata, SubmissionAdmission } from "./submission.js";
import type { JobsRuntime, JobsRuntimeBinding } from "./runtime.js";
import { type CopiedTriggerOptions } from "./trigger-validation.js";
import { stableIdentityTuple } from "./identity.js";

export async function submitAbortable(
  adapter: JobsAdapterRuntime,
  request: Parameters<JobsAdapterRuntime["submit"]>[0],
  context: OperationContext,
  signal: AbortSignal,
  metadata: TaskSubmissionMetadata,
): Promise<unknown> {
  if (signal.aborted) throw new JobSubmissionCancelledError();
  const pending = Promise.resolve().then(() => adapter.submit(request, context));
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new JobSubmissionUnknownError(metadata.operationId, metadata.idempotencyKey));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (cause) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(normalizeSubmissionError(cause, metadata));
      },
    );
  });
}

export function normalizeSubmissionError(cause: unknown, metadata: TaskSubmissionMetadata): Error {
  if (cause instanceof JobSubmissionUnknownError) return cause;
  if (isUnknown(cause)) {
    return new JobSubmissionUnknownError(
      cause.operationId || metadata.operationId,
      cause.idempotencyKey ?? metadata.idempotencyKey,
      cause.recovery,
    );
  }
  return cause instanceof Error ? cause : new JobSubmissionError(String(cause), cause);
}

export function normalizeReceipt(
  value: NativeReceipt | unknown,
  binding: JobsRuntimeBinding,
  metadata: TaskSubmissionMetadata,
): RunHandle {
  if (isUnknown(value)) {
    throw new JobSubmissionUnknownError(
      value.operationId || metadata.operationId,
      value.idempotencyKey ?? metadata.idempotencyKey,
      value.recovery,
    );
  }
  if (!isRecord(value) || value.accepted !== true) {
    throw new JobReceiptError("Native submission did not return an accepted receipt");
  }
  const required = ["runId", "jobId", "taskId", "taskVersion", "acceptedAt"] as const;
  if (required.some((key) => typeof value[key] !== "string" || String(value[key]).length === 0)) {
    throw new JobReceiptError("Native submission receipt is missing durable identity");
  }
  if (
    value.jobId !== binding.jobId ||
    value.taskId !== binding.taskId ||
    value.taskVersion !== binding.taskVersion
  ) {
    throw new JobReceiptError("Native submission receipt does not match the resolved binding");
  }
  return Object.freeze({
    accepted: true,
    runId: value.runId as string,
    jobId: value.jobId as string,
    taskId: value.taskId as string,
    taskVersion: value.taskVersion as string,
    acceptedAt: value.acceptedAt as string,
    ...(value.duplicate === true ? { duplicate: true } : {}),
    ...(typeof value.idempotencyExpiresAt === "string"
      ? { idempotencyExpiresAt: value.idempotencyExpiresAt }
      : {}),
  });
}

export function explicitOrDerivedKey(
  job: { readonly admission?: { readonly idempotency?: { readonly key?: string } } } | undefined,
  options: CopiedTriggerOptions,
  input: JsonValue | undefined,
): string | undefined {
  const field = job?.admission?.idempotency?.key;
  const derived =
    field === undefined || input === undefined || !isRecord(input)
      ? undefined
      : deriveKey(field, input);
  if (options.idempotencyKey !== undefined) {
    const explicit = boundedKey(options.idempotencyKey);
    if (derived !== undefined && explicit !== derived) {
      throw new TypeError(`Idempotency key must match the declared field "${field}"`);
    }
    return explicit;
  }
  return derived;
}

function deriveKey(field: string, input: Record<string, unknown>): string {
  const value = input[field];
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    throw new TypeError(`Idempotency field "${field}" must be a canonical scalar`);
  }
  return boundedKey(stableIdentityTuple([field, value]));
}

export function boundedKey(value: string): string {
  if (new TextEncoder().encode(value).byteLength > 256)
    throw new TypeError("Idempotency key is too long");
  return value;
}

export function scheduledTime(options: CopiedTriggerOptions, now: number): string | undefined {
  if (options.at !== undefined) return options.at;
  if (options.delay === undefined) return undefined;
  return new Date(now + durationToMillis(options.delay)).toISOString();
}

export async function hashWire(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function currentCorrelation(): string | undefined {
  const scope = currentInvocationScope() as
    { readonly parent?: { readonly correlationId?: string } } | undefined;
  return scope?.parent?.correlationId;
}

export function propagationFor(correlationId: string | undefined): TracePropagation | undefined {
  const propagation = currentTracePropagation();
  return propagation === undefined || correlationId === undefined
    ? propagation
    : Object.freeze({ ...propagation, correlationId });
}

export function currentTaskRunId(): string | undefined {
  return currentTaskAncestry()?.runId;
}

export function validatedEnvelope(admission: SubmissionAdmission) {
  return admission.canonicalInput === undefined
    ? { version: 1 as const, kind: "void" as const }
    : { version: 1 as const, kind: "json" as const, value: admission.canonicalInput };
}

export function isUnknown(
  value: unknown,
): value is JobUnknownOutcome & { readonly recovery: JobUnknownOutcome["recovery"] } {
  return (
    isRecord(value) &&
    value.outcome === "unknown" &&
    (value.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
      value.code === "RELKIT_JOB_CONTROL_UNKNOWN") &&
    typeof value.operationId === "string" &&
    isRecord(value.recovery) &&
    typeof value.recovery.action === "string"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
