import { canonicalJson } from "@relkit/contracts";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";
import type { RetryPolicy } from "@relkit/jobs";
import type {
  JobFailureMetadata,
  JobQueueEntry,
  JobQueueHandle,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";

export interface JobFailureTransition {
  readonly entry: JobQueueEntry;
  readonly classification: "retryable" | "non-retryable";
  readonly failure: JobFailureMetadata;
}

export async function transitionJobFailure(
  queue: JobQueueHandle,
  leased: JobQueueEntry,
  policy: RetryPolicy,
  cause: unknown,
  options: { readonly now?: () => number; readonly random?: () => number },
): Promise<JobFailureTransition> {
  if (!Number.isSafeInteger(leased.attempt) || leased.attempt < 1) {
    throw new JobMaterializationError("Leased job attempt must be positive");
  }
  const normalized = normalizeFailure(cause);
  const classification =
    normalized._tag === "ApplicationFailure" && normalized.retry === "later"
      ? "retryable"
      : "non-retryable";
  const retry = classification === "retryable" && leased.attempt < policy.maxAttempts;
  const delayMs = retry ? retryDelay(policy, leased.attempt, options.random) : 0;
  const requestedDelay = normalized._tag === "ApplicationFailure" ? (normalized.afterMs ?? 0) : 0;
  const now = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new JobMaterializationError("Job retry time must be non-negative");
  }
  const availableAt = retry ? addTime(now, Math.max(delayMs, requestedDelay)) : undefined;
  const failure = JSON.parse(canonicalJson(toPublicEnvelope(normalized))) as JobFailureMetadata;
  const entry = await queue.transition(leased.instanceId, retry ? "delayed" : "dead-lettered", {
    expectedState: "leased",
    ...(availableAt === undefined ? {} : { availableAt }),
    failure,
  });
  return { entry, classification, failure };
}

function retryDelay(
  policy: RetryPolicy,
  attempt: number,
  random: (() => number) | undefined,
): number {
  const exponential = policy.initialDelayMs * Math.pow(policy.multiplier, attempt - 1);
  const capped = Number.isFinite(exponential)
    ? Math.min(policy.maxDelayMs, Math.floor(exponential))
    : policy.maxDelayMs;
  if (capped === 0 || policy.jitter === "none") return capped;
  const sample = (random ?? Math.random)();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new JobMaterializationError("Job retry randomness must be in [0, 1)");
  }
  return policy.jitter === "full"
    ? Math.floor(sample * capped)
    : Math.floor(capped / 2 + sample * (capped / 2));
}

function addTime(now: number, delayMs: number): number {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > Number.MAX_SAFE_INTEGER - now) {
    throw new JobMaterializationError("Job retry availability time is invalid");
  }
  return now + delayMs;
}
