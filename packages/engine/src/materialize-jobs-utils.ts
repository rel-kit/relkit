import type { QueueRegistration } from "@relkit/graph";
import type { RetryPolicy } from "@relkit/jobs";
import type {
  JobIdempotencyDefinition,
  JobMaterializationOptions,
  JobPolicy,
  JobQueueFactoryContext,
  JobQueueHandle,
  JobQueueSource,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";
import { createConcurrencyAdmission } from "./concurrency.js";
import type { InvocationAdmit } from "./invoke-types.js";

export function readPolicy(registration: QueueRegistration): JobPolicy {
  if (registration.kind === "job") {
    return {
      jobId: registration.id,
      targetFunctionId: registration.targetFunctionId,
      profile: registration.profile ?? "default",
      retry: readRetry(registration.retry),
      ...(registration.timeoutMs == null ? {} : { timeoutMs: registration.timeoutMs }),
      ...(registration.concurrency == null ? {} : { concurrency: registration.concurrency }),
      ...(registration.idempotency === undefined
        ? {}
        : { idempotency: readIdempotency(registration.idempotency) }),
    };
  }
  const config = isRecord(registration.config)
    ? (registration.config as Record<string, unknown>)
    : {};
  const timeoutMs = readLimit(config.timeoutMs, "timeoutMs");
  const concurrency = readLimit(config.concurrency, "concurrency");
  return {
    jobId: registration.id,
    targetFunctionId: registration.targetFunctionId,
    profile: text(config.profile) ?? "default",
    retry: readRetry(config.retry),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(config.idempotency === undefined
      ? {}
      : { idempotency: readIdempotency(config.idempotency) }),
  };
}

export async function resolveQueue(
  registration: QueueRegistration,
  policy: JobPolicy,
  options: JobMaterializationOptions,
): Promise<JobQueueHandle> {
  const supplied = lookupQueue(options.queues, policy.jobId);
  if (supplied !== undefined) return supplied;
  if (options.createQueue === undefined)
    throw new JobMaterializationError(`No queue provider is bound for "${policy.jobId}"`);
  const queue = await options.createQueue({
    ...policy,
    registration,
  } satisfies JobQueueFactoryContext);
  if (queue === undefined)
    throw new JobMaterializationError(`Queue provider returned no queue for "${policy.jobId}"`);
  return queue;
}

const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

function readRetry(value: unknown): RetryPolicy {
  if (value === undefined) return DEFAULT_RETRY;
  if (!isRecord(value)) throw new JobMaterializationError("Job retry policy is invalid");
  const maxAttempts = readLimit(value.maxAttempts, "retry.maxAttempts");
  const initialDelayMs = readNonNegative(value.initialDelayMs, "retry.initialDelayMs");
  const maxDelayMs = readNonNegative(value.maxDelayMs, "retry.maxDelayMs");
  if (maxAttempts === undefined || initialDelayMs === undefined || maxDelayMs === undefined)
    throw new JobMaterializationError("Job retry policy is incomplete");
  if (
    maxDelayMs < initialDelayMs ||
    typeof value.multiplier !== "number" ||
    !Number.isFinite(value.multiplier) ||
    value.multiplier < 1
  )
    throw new JobMaterializationError("Job retry policy is invalid");
  if (value.jitter !== "none" && value.jitter !== "full" && value.jitter !== "equal")
    throw new JobMaterializationError("Job retry jitter is invalid");
  return Object.freeze({
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    multiplier: value.multiplier,
    jitter: value.jitter,
  });
}

function readIdempotency(value: unknown): JobIdempotencyDefinition {
  const key = isRecord(value) ? text(value.key) : undefined;
  const retentionMs = isRecord(value)
    ? readLimit(value.retentionMs, "idempotency.retentionMs")
    : undefined;
  if (key === undefined || retentionMs === undefined)
    throw new JobMaterializationError("Job idempotency policy is invalid");
  return { key, retentionMs };
}

export function consumerLimit(
  value: JobMaterializationOptions["consumerConcurrency"],
  jobId: string,
): number | undefined {
  return typeof value === "number"
    ? readLimit(value, "consumerConcurrency")
    : readLimit(value?.[jobId], "consumerConcurrency");
}

export function createAdmit(
  admission: ReturnType<typeof createConcurrencyAdmission>,
  policy: JobPolicy,
  functionLimit: number | undefined,
  triggerLimit: number | undefined,
): InvocationAdmit {
  return (request) =>
    admission.acquire({
      ...request,
      ...(functionLimit === undefined ? {} : { functionLimit }),
      triggerId: policy.jobId,
      ...(triggerLimit === undefined ? {} : { triggerLimit }),
    });
}

function lookupQueue(source: JobQueueSource | undefined, id: string): JobQueueHandle | undefined {
  if (source === undefined) return undefined;
  return source instanceof Map
    ? source.get(id)
    : (source as Readonly<Record<string, JobQueueHandle>>)[id];
}

function readLimit(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new JobMaterializationError(`${name} must be positive`);
  return value as number;
}
function readNonNegative(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new JobMaterializationError(`${name} must be non-negative`);
  return value as number;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
