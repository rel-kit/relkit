import { canonicalJson } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import { normalizeFailure, observeExecution, toPublicEnvelope } from "@relkit/runtime-effect";
import { Clock, Effect } from "effect";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import type { JobFailureTransition } from "./materialize-jobs-retry.types.js";
import type {
  JobFailureMetadata,
  JobQueueEntry,
  JobQueueHandle,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";
export type { JobFailureTransition } from "./materialize-jobs-retry.types.js";

/** Persist a classified retry or dead-letter transition before acknowledging failure.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding the acknowledged entry, classification and safe failure; retries remain durable transitions.
 * @param queue - Native durable queue handle.
 * @param leased - Queue entry acquired for the current attempt.
 * @param policy - Validated queue retry and idempotency policy.
 * @param cause - Original native rejection or execution cause.
 */
export const transitionJobFailureEffect = Effect.fn("Engine.transitionJobFailure")(
  function* (
    queue: JobQueueHandle,
    leased: JobQueueEntry,
    policy: RetryPolicy,
    cause: unknown,
    options: { readonly now?: () => number; readonly random?: () => number },
  ) {
    if (!Number.isSafeInteger(leased.attempt) || leased.attempt < 1) {
      return yield* Effect.fail(new JobMaterializationError("Leased job attempt must be positive"));
    }
    const normalized = normalizeFailure(cause);
    const classification: "retryable" | "non-retryable" =
      normalized._tag === "ApplicationFailure" && normalized.retry === "later"
        ? "retryable"
        : "non-retryable";
    const retry = classification === "retryable" && leased.attempt < policy.maxAttempts;
    const delayMs = retry ? retryDelay(policy, leased.attempt, options.random) : 0;
    const requestedDelay = normalized._tag === "ApplicationFailure" ? (normalized.afterMs ?? 0) : 0;
    const now = options.now?.() ?? (yield* Clock.currentTimeMillis);
    if (!Number.isSafeInteger(now) || now < 0) {
      return yield* Effect.fail(new JobMaterializationError("Job retry time must be non-negative"));
    }
    const availableAt = retry ? addTime(now, Math.max(delayMs, requestedDelay)) : undefined;
    const failure = JSON.parse(canonicalJson(toPublicEnvelope(normalized))) as JobFailureMetadata;
    const entry = yield* enginePromise(() =>
      Promise.resolve(
        queue.transition(leased.instanceId, retry ? "delayed" : "dead-lettered", {
          expectedState: "leased",
          ...(availableAt === undefined ? {} : { availableAt }),
          failure,
        }),
      ),
    );
    return { entry, classification, failure };
  },
  (effect) => observeExecution("engine", "transitionJobFailure", effect),
);

/** Persist a classified retry or dead-letter transition before acknowledging failure.
 * @returns A Promise of the classified, persisted retry/dead-letter result.
 * @param queue - Native durable queue handle.
 * @param leased - Queue entry acquired for the current attempt.
 * @param policy - Validated queue retry and idempotency policy.
 * @param cause - Original native rejection or execution cause.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function transitionJobFailure(
  queue: JobQueueHandle,
  leased: JobQueueEntry,
  policy: RetryPolicy,
  cause: unknown,
  options: { readonly now?: () => number; readonly random?: () => number },
): Promise<JobFailureTransition> {
  return runEnginePromise(transitionJobFailureEffect(queue, leased, policy, cause, options));
}

/** Calculate capped exponential backoff with injected jitter.
 * @returns The non-negative capped delay in milliseconds.
 * @param policy - Validated queue retry and idempotency policy.
 * @param attempt - Current durable execution attempt number.
 * @param random - Injected random source for deterministic retry jitter.
 */
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

/** Add a validated retry delay without exceeding safe timestamp bounds.
 * @returns A safe timestamp after adding the retry delay.
 * @param now - Current timestamp in milliseconds.
 * @param delayMs - Delay to add to the current timestamp.
 */
function addTime(now: number, delayMs: number): number {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > Number.MAX_SAFE_INTEGER - now) {
    throw new JobMaterializationError("Job retry availability time is invalid");
  }
  return now + delayMs;
}
