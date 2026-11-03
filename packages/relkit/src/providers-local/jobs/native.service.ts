import { join } from "node:path";
import { nativeJobMetadata } from "./native-capabilities.js";
import { Clock, Context, Effect, Layer, Ref, Semaphore, Stream } from "effect";
import { LocalOperationError, localOperation, localPromise, localSync } from "../local-effect.js";
import { cancelRun, retryRun } from "./native-adapter-controls.js";
import { createRun, handle, listRuns, newRunId, snapshot } from "./native-adapter-runs.js";
import { controlKey, requestKey, sameNamespace } from "./native-adapter-support.js";
import {
  openNativeStore,
  persistNativeControl,
  persistNativeRun,
} from "./native-adapter-storage.js";
import { observeRun } from "./native-adapter-work.js";
import { makeNativeWorker } from "./native-worker.js";
import type { LocalNativeState } from "./native-adapter-types.js";
import type { NativeJobEffects, NativeMutation } from "./native.service.types.js";

/** Native job submission, controls and worker commits share one lifecycle owner. */
export class LocalNativeJobService extends Context.Service<
  LocalNativeJobService,
  NativeJobEffects
>()("@relkit/providers-local/NativeJobs") {}

/**
 * Provides native jobs and closes its recovered journal at scope exit.
 * @param root - Provider-owned state directory.
 * @param profile - Namespace within the jobs root.
 * @returns A scoped layer with the same contract used by test substitutes.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalNativeJobService, nativeJobLayer } from "./native.service.js";
 *
 * const program = Effect.gen(function* () {
 *   const jobs = yield* LocalNativeJobService;
 *     return jobs.metadata.capabilities;
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(nativeJobLayer("/tmp/example-jobs", "demo"))));
 * ```
 */
export function nativeJobLayer(root: string, profile: string) {
  return Layer.effect(
    LocalNativeJobService,
    Effect.acquireRelease(makeNativeJobService(root, profile), (service) =>
      service.close().pipe(Effect.orDie),
    ),
  );
}

/**
 * Constructs lazy recovery, serialized transitions and stream observation.
 * @param root - Owned directory; no journal IO occurs until the first operation.
 * @param profile - Local profile used in paths and provider identity.
 * @returns A synchronous service acquisition whose typed failures preserve public errors.
 */
export const makeNativeJobService = Effect.fn("NativeJob.create")(
  function* (root: string, profile: string) {
    const state: LocalNativeState = {
      runs: new Map(),
      idempotency: new Map(),
      retryControls: new Map(),
      cancelControls: new Map(),
    };
    const closed = yield* Ref.make(false);
    const permit = yield* Semaphore.make(1);
    const ready = yield* Effect.cached(
      Effect.fn("NativeJob.recover")(
        function* () {
          const store = yield* localPromise(() =>
            openNativeStore(join(root, "jobs", profile, "native"), state),
          );
          const now = yield* Clock.currentTimeMillis;
          yield* Effect.forEach(
            state.runs.values(),
            (run) =>
              Effect.gen(function* () {
                if (run.status === "running") {
                  run.status = "queued";
                  run.nextEligibleAt = new Date(now).toISOString();
                  delete run.controller;
                  delete run.controllerCleanup;
                  yield* localPromise(() => persistNativeRun(store, run));
                }
                const key = requestKey(run.request, run.namespace);
                if (key !== undefined) state.idempotency.set(key, run.runId);
              }),
            { discard: true },
          );
          return store;
        },
        (effect) => localOperation("NativeJob.recover", effect),
      )(),
    );
    /**
     * Checks whether the owner still admits new operations.
     * @returns A lazy validation effect failing with the established closed-owner error.
     */
    const ensureOpen = () =>
      localSync(() => {
        if (Ref.getUnsafe(closed)) throw new Error("Local native jobs adapter is closed");
      });
    /**
     * Serializes admitted mutations and preserves atomic durable acknowledgement sections.
     * @param operation - Static bounded owning-operation label.
     * @param effect - Lazy operation admitted by this owner.
     * @returns The operation result after the owner serialization boundary.
     */
    const serialize: NativeMutation = (operation, effect) =>
      localOperation(
        operation,
        Effect.andThen(
          ensureOpen(),
          Effect.andThen(ready, permit.withPermits(1)(effect.pipe(Effect.uninterruptible))),
        ),
      );
    const close = yield* Effect.cached(
      Effect.fn("NativeJob.close")(
        function* () {
          yield* Ref.set(closed, true);
          yield* permit.withPermits(1)(
            Effect.gen(function* () {
              const store = state.store;
              if (store !== undefined) yield* localPromise(() => store.close());
              for (const run of state.runs.values()) {
                run.controllerCleanup?.();
                delete run.controllerCleanup;
              }
            }),
          );
        },
        (effect) => localOperation("NativeJob.close", effect),
      )(),
    );
    return LocalNativeJobService.of({
      metadata: nativeJobMetadata(profile),
      submit: Effect.fn("NativeJob.submit")((request, context) =>
        serialize(
          "NativeJob.submit",
          Effect.gen(function* () {
            yield* localSync(() => {
              if (request.scope !== undefined && request.scope !== context.scope)
                throw new Error("Native submission scope does not match the operation scope");
            });
            const store = yield* ready;
            const key = requestKey(request, context),
              existing = key === undefined ? undefined : state.idempotency.get(key);
            const prior = existing === undefined ? undefined : state.runs.get(existing);
            if (prior !== undefined) return { ...handle(prior), duplicate: true };
            const run = yield* localSync(() =>
              createRun(request, context, newRunId(`local-${profile}`)),
            );
            yield* localPromise(() => persistNativeRun(store, run));
            state.runs.set(run.runId, run);
            if (key !== undefined) state.idempotency.set(key, run.runId);
            return handle(run);
          }),
        ),
      ),
      get: Effect.fn("NativeJob.get")(
        function* (locator, context) {
          yield* ensureOpen();
          yield* ready;
          return yield* localSync(() => {
            const run = state.runs.get(locator);
            if (run === undefined || !sameNamespace(run, context))
              throw new Error("Native run was not found");
            return snapshot(run);
          });
        },
        (effect) => localOperation("NativeJob.get", effect),
      ),
      list: Effect.fn("NativeJob.list")(
        function* (query, context) {
          yield* ensureOpen();
          yield* ready;
          return yield* localSync(() => listRuns(state, query, context));
        },
        (effect) => localOperation("NativeJob.list", effect),
      ),
      cancel: Effect.fn("NativeJob.cancel")((request, context) =>
        serialize(
          "NativeJob.cancel",
          Effect.gen(function* () {
            const store = yield* ready;
            const receipt = yield* localPromise(() => cancelRun(state, request, context));
            const run = state.runs.get(request.runId);
            if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
            yield* localPromise(() =>
              persistNativeControl(
                store,
                "cancel",
                controlKey("cancel", request.runId, request.operationId, context),
                receipt,
              ),
            );
            return receipt;
          }),
        ),
      ),
      retry: Effect.fn("NativeJob.retry")((request, context) =>
        serialize(
          "NativeJob.retry",
          Effect.gen(function* () {
            const store = yield* ready;
            const receipt = yield* localPromise(() => retryRun(state, request, context));
            const run = "runId" in receipt ? state.runs.get(receipt.runId) : undefined;
            if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
            yield* localPromise(() =>
              persistNativeControl(
                store,
                "retry",
                controlKey("retry", request.runId, request.operationId, context),
                receipt,
              ),
            );
            return receipt;
          }),
        ),
      ),
      observe: (request, context) =>
        Stream.unwrap(
          Effect.andThen(
            ensureOpen(),
            Effect.map(ready, () =>
              Stream.fromAsyncIterable(
                observeRun(state, request, context),
                (cause) => new LocalOperationError({ cause }),
              ),
            ),
          ),
        ),
      worker: makeNativeWorker(state, ready, serialize),
      close: () => close,
    });
  },
  (effect) => localOperation("NativeJob.create", effect),
);
