import type { QueueRegistration } from "@relkit/graph";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { createConcurrencyAdmission } from "./concurrency.js";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import type { InvocationAdmit } from "./invoke-types.js";
import type {
  JobIdempotencyDefinition,
  JobMaterializationOptions,
  JobPolicy,
  JobQueueFactoryContext,
  JobQueueHandle,
  JobQueueSource,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";

/** Validate legacy queue policy and preserve durable retry/idempotency settings.
 * @returns Validated queue policy suitable for durable provider transitions.
 * @param registration - Validated provider or schedule registration.
 */
export function readPolicy(registration: QueueRegistration): JobPolicy {
  if (registration.kind === "job") {
    return {
      jobId: registration.id,
      targetFunctionId: registration.targetFunctionId,
      profile: registration.profile ?? "default",
      retry: readRetry(registration.retry),
      ...(registration.timeoutMs == null ? {} : { timeoutMs: registration.timeoutMs }),
      ...(registration.concurrency == null ? {} : { concurrency: registration.concurrency }),
      ...(registration.idempotency == null
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
    ...(config.idempotency == null ? {} : { idempotency: readIdempotency(config.idempotency) }),
  };
}

/** Resolve a ready queue or invoke the explicit queue factory.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding the native queue; missing providers fail with JobMaterializationError.
 * @param registration - Validated provider or schedule registration.
 * @param policy - Validated queue retry and idempotency policy.
 */
export const resolveQueueEffect = Effect.fn("Engine.resolveQueue")(
  function* (
    registration: QueueRegistration,
    policy: JobPolicy,
    options: JobMaterializationOptions,
  ) {
    const supplied = lookupQueue(options.queues, policy.jobId);
    if (supplied !== undefined) return supplied;
    const createQueue = options.createQueue;
    if (createQueue === undefined)
      return yield* Effect.fail(
        new JobMaterializationError(`No queue provider is bound for "${policy.jobId}"`),
      );
    const queue = yield* enginePromise(() =>
      Promise.resolve(
        createQueue({
          ...policy,
          registration,
        } satisfies JobQueueFactoryContext),
      ),
    );
    if (queue === undefined)
      return yield* Effect.fail(
        new JobMaterializationError(`Queue provider returned no queue for "${policy.jobId}"`),
      );
    return queue;
  },
  (effect) => observeExecution("engine", "resolveQueue", effect),
);

/** Resolve a ready queue or invoke the explicit queue factory.
 * @returns A Promise of the ready queue handle.
 * @param registration - Validated provider or schedule registration.
 * @param policy - Validated queue retry and idempotency policy.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function resolveQueue(
  registration: QueueRegistration,
  policy: JobPolicy,
  options: JobMaterializationOptions,
): Promise<JobQueueHandle> {
  return runEnginePromise(resolveQueueEffect(registration, policy, options));
}

const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

/** Validate persisted queue retry settings without scheduling in-memory retries.
 * @returns Validated retry settings used by durable queue transitions.
 * @param value - Native value being validated or projected.
 */
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

/** Validate explicit queue deduplication policy.
 * @returns A validated durable idempotency policy.
 * @param value - Native value being validated or projected.
 */
function readIdempotency(value: unknown): JobIdempotencyDefinition {
  const key = isRecord(value) ? text(value.key) : undefined;
  const retentionMs = isRecord(value)
    ? readLimit(value.retentionMs, "idempotency.retentionMs")
    : undefined;
  if (key === undefined || retentionMs === undefined)
    throw new JobMaterializationError("Job idempotency policy is invalid");
  return { key, retentionMs };
}

/** Read the configured consumer concurrency limit for one queue.
 * @returns The validated shared or per-queue limit, or undefined when absent.
 * @param value - Shared consumer capacity or capacity indexed by queue identifier.
 * @param jobId - Queue identifier used to select a per-queue limit.
 */
export function consumerLimit(
  value: JobMaterializationOptions["consumerConcurrency"],
  jobId: string,
): number | undefined {
  return typeof value === "number"
    ? readLimit(value, "consumerConcurrency")
    : readLimit(value?.[jobId], "consumerConcurrency");
}

/** Bind coordinated admission to a queue's trigger identity.
 * @returns An admission callback bound to this queue trigger.
 * @param admission - Generation coordinator enforcing joint FIFO capacity.
 * @param policy - Validated queue retry and idempotency policy.
 * @param functionLimit - Optional maximum active executions for the function.
 * @param triggerLimit - Optional capacity limit for this trigger.
 */
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

/** Read a preconstructed durable queue by logical identity.
 * @returns The configured queue handle, or undefined.
 * @param source - Explicit native source or source collection.
 * @param id - Logical queue identifier looked up without acquiring another handle.
 */
function lookupQueue(source: JobQueueSource | undefined, id: string): JobQueueHandle | undefined {
  if (source === undefined) return undefined;
  return source instanceof Map
    ? source.get(id)
    : (source as Readonly<Record<string, JobQueueHandle>>)[id];
}

/** Validate optional positive integer capacity settings.
 * @returns A valid optional capacity limit.
 * @param value - Native value being validated or projected.
 * @param name - Declared operation, dependency or field name.
 */
function readLimit(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new JobMaterializationError(`${name} must be positive`);
  return value as number;
}
/** Validate an optional non-negative finite numeric setting.
 * @returns A valid optional non-negative setting.
 * @param value - Native value being validated or projected.
 * @param name - Declared operation, dependency or field name.
 */
function readNonNegative(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new JobMaterializationError(`${name} must be non-negative`);
  return value as number;
}
/** Read optional string metadata without coercion.
 * @returns A trimmed nonempty string or undefined.
 * @param value - Native value being validated or projected.
 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
