import { notifyNativeJobs } from "./native-jobs-state.js";
import { nativeJobObservation } from "./native-jobs-observe.js";
import { Context, Deferred, Effect, Layer, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import { createDeterministicClock } from "./runtime-clock.js";
import type { TestJobsAdapterOptions } from "./test-jobs-adapter.js";
import type { NativeJobsService, NativeJobsState } from "./native-jobs.types.js";

import { cancel, retry, unknown } from "./test-jobs-adapter-controls.js";
import { createRun, complete, fail, handle, list, next } from "./test-jobs-adapter-work.js";
import { detachedNativeSnapshot, requestKey } from "./test-jobs-adapter-support.js";

/** Owns authoritative native run state, deterministic time and observation synchronization. */
export class TestNativeJobs extends Context.Service<TestNativeJobs, NativeJobsService>()(
  "relkit/testing/NativeJobs",
) {}

/**
 * Builds one native jobs service, substitutable by providing TestNativeJobs.of in tests.
 * @param options Deterministic clock, service identity and ambiguous-write injection.
 * @returns A synchronous Layer; no worker or observation polling loop starts during acquisition.
 */
export function nativeJobsLayer(options: TestJobsAdapterOptions = {}) {
  return Layer.effect(
    TestNativeJobs,
    Effect.acquireRelease(
      Effect.sync(() => {
        const clock = options.clock ?? createDeterministicClock(options.startTimeMs ?? 0).clock;
        const service = options.service ?? "test-jobs";
        const state = Ref.makeUnsafe<NativeJobsState>({
          runs: new Map(),
          keys: new Map(),
          cancelReceipts: new Map(),
          retryReceipts: new Map(),
          sequence: 0,
          closed: false,
          changed: Deferred.makeUnsafe(),
        });

        /** Executes a synchronous admission/state transition atomically before yielding.
         * @typeParam A Native transition result.
         * @param operation Declaration-owned telemetry operation name.
         * @param mutate State mutation or query performed under the owner.
         * @param changed Whether observers must be resumed after this transition.
         * @param allowClosed Whether this retained-state inspection permits closed owners.
         * @returns An Effect preserving the original error object.
         */
        const transition = <A>(
          operation: string,
          mutate: (value: NativeJobsState) => A,
          changed = false,
          allowClosed = false,
        ) =>
          observeExecution(
            "testing",
            operation,
            Effect.fn("Testing.nativeJobs.transition")(() =>
              Effect.try({
                try: () => {
                  const value = Ref.getUnsafe(state);
                  if (value.closed && !allowClosed) throw new Error("Test jobs adapter is closed");
                  const result = mutate(value);
                  if (changed) notifyNativeJobs(value);
                  return result;
                },
                catch: (cause) => cause,
              }),
            )(),
          );

        return TestNativeJobs.of({
          state,
          clock,
          submit: (request, context) =>
            transition(
              "jobs.submit",
              (value) => {
                if (context.signal.aborted)
                  throw context.signal.reason ?? new Error("Job operation cancelled");
                if (options.unknown?.submit)
                  return unknown(
                    "RELKIT_JOB_SUBMISSION_UNKNOWN",
                    request.operationId,
                    request.idempotencyKey,
                  );
                const key = requestKey(request);
                const existing = key === undefined ? undefined : value.keys.get(key);
                if (existing !== undefined)
                  return { ...handle(value.runs.get(existing)!), duplicate: true };
                const run = createRun(
                  structuredClone(request),
                  `test-run-${++value.sequence}`,
                  undefined,
                  clock,
                );
                value.runs.set(run.runId, run);
                if (key !== undefined) value.keys.set(key, run.runId);
                return handle(run);
              },
              true,
            ),
          get: (id) =>
            transition(
              "jobs.get",
              (value) => detachedNativeSnapshot(value, id, service, clock),
              false,
              true,
            ),
          snapshot: (id) =>
            transition(
              "jobs.snapshot",
              (value) => detachedNativeSnapshot(value, id, service, clock),
              false,
              true,
            ),
          list: (query) =>
            transition(
              "jobs.list",
              (value) => list(value.runs, query, service, clock),
              false,
              true,
            ),
          cancel: (request, context) =>
            observeExecution(
              "testing",
              "jobs.cancel",
              Effect.fn("Testing.nativeJobs.cancel")(function* () {
                if (context.signal.aborted)
                  return yield* Effect.fail(
                    context.signal.reason ?? new Error("Job operation cancelled"),
                  );
                const value = yield* Ref.get(state);
                if (value.closed)
                  return yield* Effect.fail(new Error("Test jobs adapter is closed"));
                const receipt = yield* Effect.tryPromise({
                  try: () =>
                    cancel(
                      value.runs,
                      value.cancelReceipts,
                      request,
                      options.unknown?.cancel === true,
                      service,
                      clock,
                    ),
                  catch: (cause) => cause,
                });
                notifyNativeJobs(value);
                return structuredClone(receipt);
              })(),
            ),
          retry: (request, context) =>
            observeExecution(
              "testing",
              "jobs.retry",
              Effect.fn("Testing.nativeJobs.retry")(function* () {
                if (context.signal.aborted)
                  return yield* Effect.fail(
                    context.signal.reason ?? new Error("Job operation cancelled"),
                  );
                const value = yield* Ref.get(state);
                if (value.closed)
                  return yield* Effect.fail(new Error("Test jobs adapter is closed"));
                const receipt = yield* Effect.tryPromise({
                  try: () =>
                    retry(
                      value.runs,
                      value.retryReceipts,
                      request,
                      options.unknown?.retry === true,
                      service,
                      clock,
                    ),
                  catch: (cause) => cause,
                });
                value.sequence = Math.max(value.sequence, value.runs.size);
                notifyNativeJobs(value);
                return structuredClone(receipt);
              })(),
            ),
          worker: {
            next: (context) =>
              observeExecution(
                "testing",
                "jobs.next",
                Effect.fn("Testing.nativeJobs.next")(function* () {
                  const value = yield* Ref.get(state);
                  if (value.closed) return undefined;
                  if (context.signal.aborted)
                    return yield* Effect.fail(
                      context.signal.reason ?? new Error("Job operation cancelled"),
                    );
                  const work = yield* Effect.tryPromise({
                    try: () => next(value.runs, context, service, clock),
                    catch: (cause) => cause,
                  });
                  if (work !== undefined) notifyNativeJobs(value);
                  return work;
                })(),
              ),
            complete: (id, output) =>
              finish(id, () =>
                complete(Ref.getUnsafe(state).runs.get(id), structuredClone(output), clock),
              ),
            fail: (id, error) =>
              finish(id, () => fail(Ref.getUnsafe(state).runs.get(id), error, clock)),
          },
          observe: (request, context) =>
            nativeJobObservation(state, clock, service, request, context),
          close: Effect.fn("Testing.nativeJobs.close")(() =>
            Effect.sync(() => {
              const value = Ref.getUnsafe(state);
              if (value.closed) return;
              value.closed = true;
              for (const run of value.runs.values()) {
                run.controller?.abort(new Error("Test jobs adapter is closed"));
                run.disposeSignal?.();
              }
              notifyNativeJobs(value);
            }),
          )(),
        });

        /**
         * Completes a worker transition and wakes observations after native settlement.
         * @param id Run identity for bounded telemetry context.
         * @param work Native completion/failure mutation.
         * @returns Completion; terminal runs ignore late worker results.
         */
        function finish(id: string, work: () => Promise<void>) {
          return observeExecution(
            "testing",
            "jobs.finish",
            Effect.fn("Testing.nativeJobs.finish")(function* () {
              const value = yield* Ref.get(state);
              if (value.closed) return;
              yield* Effect.tryPromise({ try: work, catch: (cause) => cause });
              value.runs.get(id)?.disposeSignal?.();
              notifyNativeJobs(value);
            })(),
          );
        }
      }),
      (service) => service.close,
    ),
  );
}
