import { Effect } from "effect";
import { localPromise, type LocalOperationError } from "../local-effect.js";
import { completeRun, failRun, nextRun, suspendRun } from "./native-adapter-work.js";
import { persistNativeRun } from "./native-adapter-storage.js";
import type { LocalNativeState } from "./native-adapter-types.js";
import type { JobStore } from "./store.js";
import type { NativeMutation, NativeWorkerEffects } from "./native.service.types.js";

/**
 * Composes worker transitions with the provider's durable mutation owner.
 * @param state - Private native run indexes, accessed only under serialization.
 * @param ready - Shared lazy store recovery.
 * @param serialize - Provider admission and commit boundary.
 * @returns Worker operations that acknowledge only after persistence.
 */
export function makeNativeWorker(
  state: LocalNativeState,
  ready: Effect.Effect<JobStore, LocalOperationError>,
  serialize: NativeMutation,
): NativeWorkerEffects {
  return {
    next: Effect.fn("NativeJob.next")((context) =>
      serialize(
        "NativeJob.next",
        Effect.gen(function* () {
          const store = yield* ready;
          const work = yield* localPromise(() => nextRun(state, context));
          const run = work === undefined ? undefined : state.runs.get(work.envelope.runId);
          if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
          return work;
        }),
      ),
    ),
    complete: Effect.fn("NativeJob.complete")((runId, output, context) =>
      serialize(
        "NativeJob.complete",
        Effect.gen(function* () {
          const store = yield* ready;
          yield* localPromise(() => completeRun(state, runId, output, context));
          const run = state.runs.get(runId);
          if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
        }),
      ),
    ),
    fail: Effect.fn("NativeJob.fail")((runId, error, context) =>
      serialize(
        "NativeJob.fail",
        Effect.gen(function* () {
          const store = yield* ready;
          yield* localPromise(() => failRun(state, runId, error, context));
          const run = state.runs.get(runId);
          if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
        }),
      ),
    ),
    suspend: Effect.fn("NativeJob.suspend")((runId, value, context) =>
      serialize(
        "NativeJob.suspend",
        Effect.gen(function* () {
          const store = yield* ready;
          yield* localPromise(() => suspendRun(state, runId, value, context));
          const run = state.runs.get(runId);
          if (run !== undefined) yield* localPromise(() => persistNativeRun(store, run));
        }),
      ),
    ),
  };
}
