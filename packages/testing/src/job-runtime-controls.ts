import { Effect } from "effect";
import type { JobQueue } from "@relkit/providers-local";
import type { JobRunResult } from "@relkit/engine";
import type { JobWorkerState } from "./job-runtime.types.js";

/**
 * Persists one submission before making a new durable instance available.
 * @param queue Authoritative native queue for the admitted generation.
 * @param input Native canonical submission and producer propagation.
 * @param signal Native producer cancellation checked before acceptance.
 * @returns Native acceptance, preserving duplicate identity and transition failures.
 */
export const enqueueJob = Effect.fn("Testing.job.enqueue")(function* (
  queue: JobQueue,
  input: Parameters<JobQueue["enqueue"]>[0],
  signal: AbortSignal,
) {
  if (signal.aborted) return yield* Effect.fail(new Error("Job operation cancelled"));
  const accepted = yield* Effect.tryPromise({
    try: () => queue.enqueue(input),
    catch: (cause) => cause,
  });
  if (!accepted.duplicate)
    yield* Effect.tryPromise({
      try: () => queue.transition(accepted.instanceId, "available", { expectedState: "accepted" }),
      catch: (cause) => cause,
    });
  return accepted;
});

/**
 * Promotes due entries in native snapshot order before worker admission.
 * @param queue Authoritative durable native queue.
 * @param currentTimeMs Owner's deterministic timestamp authority.
 * @returns Completion after every eligible transition acknowledges.
 */
export const promoteDueJobs = Effect.fn("Testing.job.promoteDue")(function* (
  queue: JobQueue,
  currentTimeMs: () => number,
) {
  const now = currentTimeMs();
  const due = queue
    .snapshot()
    .filter(
      (entry) => entry.state === "delayed" && (entry.availableAt ?? Number.MAX_SAFE_INTEGER) <= now,
    );
  yield* Effect.forEach(
    due,
    (entry) =>
      Effect.tryPromise({
        try: () =>
          queue.transition(entry.instanceId, "available", {
            expectedState: "delayed",
            availableAt: now,
          }),
        catch: (cause) => cause,
      }),
    { concurrency: 1, discard: true },
  );
});

/**
 * Composes native worker selection and retry promotion against the current generation.
 * @param state Lazy native authorities and explicit deterministic time/admission state.
 * @returns Ordered Effect worker workflows, admitted by the owning harness service.
 */
export function jobWorkerControls(state: JobWorkerState) {
  /**
   * Promotes due retries before one authoritative native worker turn.
   * @param instanceId Optional explicit durable instance identity.
   * @returns Original native outcome after promotion completes.
   */
  const runNext = Effect.fn("Testing.job.runNext")(function* (instanceId?: string) {
    yield* promoteDueJobs(state.queue(), state.now);
    return yield* Effect.tryPromise({
      try: () =>
        instanceId === undefined
          ? state.worker().runNext(state.jobId)
          : state.worker().runNext(state.jobId, instanceId),
      catch: (cause) => cause,
    });
  });
  /** Drains current work in native order, checking closed admission before each selection. */
  const drain = Effect.fn("Testing.job.drain")(function* () {
    const results: JobRunResult[] = [];
    while (!state.isClosed()) {
      yield* promoteDueJobs(state.queue(), state.now);
      const next = state.queue().selectAvailable(1, state.now())[0];
      if (next === undefined) return Object.freeze(results);
      const result = yield* Effect.tryPromise({
        try: () => state.worker().runNext(state.jobId, next.instanceId),
        catch: (cause) => cause,
      });
      if (result === undefined) return Object.freeze(results);
      results.push(result);
    }
    return Object.freeze(results);
  })();
  return { runNext, drain };
}
