import { canonicalJson, deepFreeze } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";
import {
  JobQueueStateError,
  assertTime,
  type JobFailureMetadata,
  type JobQueue,
  type JobQueueEntry,
} from "./queue-utils.js";

export type RetryClassification = "retryable" | "non-retryable";
export type RetryState = "delayed" | "dead-lettered";
export type RandomSource = () => number;

export interface RetryPlan {
  readonly classification: RetryClassification;
  readonly state: RetryState;
  readonly attempt: number;
  readonly delayMs: number;
  readonly failure: JobFailureMetadata;
}

export interface RetryOptions {
  readonly now?: () => number;
  readonly random?: RandomSource;
}

/** Uses the declared error policy; non-declared failures are not retried. */
export function classifyFailure(value: unknown): RetryClassification {
  const failure = normalizeFailure(value);
  return failure._tag === "ApplicationFailure" && failure.retry === "later"
    ? "retryable"
    : "non-retryable";
}

/** Calculates a bounded, integer delay for a one-based completed attempt. */
export function calculateRetryDelay(
  policy: RetryPolicy,
  attempt: number,
  random: RandomSource = Math.random,
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

/** Applies one leased attempt's retry/dead-letter outcome durably. */
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
  const now = options.now?.() ?? Date.now();
  assertTime(now, "retry time");
  const availableAt = plan.state === "delayed" ? addTime(now, plan.delayMs) : undefined;
  return queue.transition(instanceId, plan.state, {
    expectedState: "leased",
    ...(availableAt === undefined ? {} : { availableAt }),
    failure: plan.failure,
  });
}

export function safeFailureMetadata(value: unknown): JobFailureMetadata {
  return deepFreeze(
    JSON.parse(canonicalJson(toPublicEnvelope(normalizeFailure(value)))) as JobFailureMetadata,
  );
}

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

function assertAttempt(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new JobQueueStateError("Retry attempt must be a positive integer");
}

function addTime(now: number, delayMs: number): number {
  if (delayMs > Number.MAX_SAFE_INTEGER - now)
    throw new JobQueueStateError("Retry availability time is invalid");
  return now + delayMs;
}
