import { nativeNow, nativeRandom } from "../native-services.js";
import type {
  RetryClassification,
  RetryState,
  RandomSource,
  RetryPlan,
  RetryOptions,
} from "./retry.types.js";
import { canonicalJson, deepFreeze } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";
import {
  JobQueueStateError,
  assertTime,
  type JobFailureMetadata,
  type JobQueue,
  type JobQueueEntry,
} from "./queue-utils.js";

export type {
  RetryClassification,
  RetryState,
  RandomSource,
  RetryPlan,
  RetryOptions,
} from "./retry.types.js";

/** Uses the declared error policy; non-declared failures are not retried.
 * @param value - Value to validate, normalize or project.
 * @returns The retryability classification for the normalized failure.
 */
export function classifyFailure(value: unknown): RetryClassification {
  const failure = normalizeFailure(value);
  return failure._tag === "ApplicationFailure" && failure.retry === "later"
    ? "retryable"
    : "non-retryable";
}

/** Calculates a bounded, integer delay for a one-based completed attempt.
 * @param policy - Validated effective domain policy.
 * @param attempt - One-based completed attempt number.
 * @param random - Replaceable source of jitter samples in [0, 1).
 * @returns The bounded integer retry delay in milliseconds.
 */
export function calculateRetryDelay(
  policy: RetryPolicy,
  attempt: number,
  random: RandomSource = nativeRandom,
): number {
  assertPolicy(policy);
  assertAttempt(attempt);
  const exponential = policy.initialDelayMs * Math.pow(policy.multiplier, attempt - 1);
  const capped = Number.isFinite(exponential)
    ? Math.min(policy.maxDelayMs, Math.floor(exponential))
    : policy.maxDelayMs;
  if (capped === 0 || policy.jitter === "none") return capped;
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new TypeError("Retry randomness must be in [0, 1)");
  return policy.jitter === "full"
    ? Math.floor(sample * capped)
    : Math.floor(capped / 2 + sample * (capped / 2));
}

/** Combines normalized failure classification, attempt limits and retry jitter into a retry plan.
 * @param policy - Validated effective domain policy.
 * @param attempt - One-based completed attempt number.
 * @param failure - Attempt failure to classify.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The retry classification, delay and safe failure metadata.
 */
export function planRetry(
  policy: RetryPolicy,
  attempt: number,
  failure: unknown,
  options: Pick<RetryOptions, "random"> = {},
): RetryPlan {
  assertAttempt(attempt);
  const normalized = normalizeFailure(failure);
  const classification = classifyFailure(normalized);
  const retry = classification === "retryable" && attempt < policy.maxAttempts;
  const policyDelay = retry ? calculateRetryDelay(policy, attempt, options.random) : 0;
  const errorDelay = normalized._tag === "ApplicationFailure" ? (normalized.afterMs ?? 0) : 0;
  return deepFreeze({
    classification,
    state: retry ? "delayed" : "dead-lettered",
    attempt,
    delayMs: retry ? Math.max(policyDelay, errorDelay) : 0,
    failure: safeFailureMetadata(normalized),
  });
}

/** Applies one leased attempt's retry/dead-letter outcome durably.
 * @param queue - Owning durable queue operations.
 * @param instanceId - Queue or journal instance identity.
 * @param policy - Validated effective domain policy.
 * @param failure - Attempt failure to classify.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The durable retry result after recording its outcome.
 */
export async function applyRetry(
  queue: Pick<JobQueue, "get" | "transition">,
  instanceId: string,
  policy: RetryPolicy,
  failure: unknown,
  options: RetryOptions = {},
): Promise<JobQueueEntry> {
  const current = queue.get(instanceId);
  if (current === undefined) throw new JobQueueStateError(`Job ${instanceId} is unknown`);
  if (current.state !== "leased") throw new JobQueueStateError(`Job ${instanceId} is not leased`);
  const plan = planRetry(policy, current.attempt, failure, options);
  const now = options.now?.() ?? nativeNow();
  assertTime(now, "retry time");
  const availableAt = plan.state === "delayed" ? addTime(now, plan.delayMs) : undefined;
  return queue.transition(instanceId, plan.state, {
    expectedState: "leased",
    ...(availableAt === undefined ? {} : { availableAt }),
    failure: plan.failure,
  });
}

/** Copies the public failure envelope so persisted metadata cannot retain arbitrary error objects.
 * @param value - Value to validate, normalize or project.
 * @returns The immutable public failure metadata.
 */
export function safeFailureMetadata(value: unknown): JobFailureMetadata {
  return deepFreeze(
    JSON.parse(canonicalJson(toPublicEnvelope(normalizeFailure(value)))) as JobFailureMetadata,
  );
}

/** Validates retry attempt, delay, multiplier and jitter bounds.
 * @param policy - Validated effective domain policy.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
function assertPolicy(policy: RetryPolicy): void {
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1)
    throw new TypeError("retry.maxAttempts must be a positive integer");
  if (!Number.isSafeInteger(policy.initialDelayMs) || policy.initialDelayMs < 0)
    throw new TypeError("retry.initialDelayMs must be a non-negative integer");
  if (!Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.initialDelayMs)
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  if (!Number.isFinite(policy.multiplier) || policy.multiplier < 1)
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  if (!["none", "full", "equal"].includes(policy.jitter))
    throw new TypeError("retry.jitter must be none, full, or equal");
}

/** Rejects an invalid one-based attempt counter.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
function assertAttempt(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new JobQueueStateError("Retry attempt must be a positive integer");
}

/** Adds a retry delay while rejecting overflow beyond safe millisecond precision.
 * @param now - Current clock time in milliseconds.
 * @param delayMs - Delay in milliseconds.
 * @returns The safe resulting millisecond time.
 */
function addTime(now: number, delayMs: number): number {
  if (delayMs > Number.MAX_SAFE_INTEGER - now)
    throw new JobQueueStateError("Retry availability time is invalid");
  return now + delayMs;
}
