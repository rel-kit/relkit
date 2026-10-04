import { Deferred, Effect, Ref, Stream } from "effect";
import { observeExecutionStream } from "@relkit/contracts/operation";
import { interruptOnSignal } from "@relkit/runtime-effect";
import type { NativeWatchRequest, OperationContext } from "@relkit/jobs/adapter";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { NativeJobsState } from "./native-jobs.types.js";
import type { TestClock } from "./runtime.js";
import { isTerminal, snapshotOf } from "./test-jobs-adapter-support.js";

/**
 * Publishes owner state availability without polling or sharing observer cursors.
 * @param state Authoritative run state and current change notification.
 * @param clock Injected deterministic observation clock.
 * @param service Native service identity retained in snapshots.
 * @param request Accepted native run to observe.
 * @param context Native caller cancellation boundary.
 * @returns A scoped stream including the terminal frame and ending on owner close.
 */
export function nativeJobObservation(
  state: Ref.Ref<NativeJobsState>,
  clock: TestClock,
  service: string,
  request: NativeWatchRequest,
  context: OperationContext,
) {
  return observeExecutionStream(
    "testing",
    "jobs.observe",
    Stream.suspend(() => {
      let previous: Deferred.Deferred<void> | undefined;
      return Stream.unfold(0, (sequence) =>
        Effect.gen(function* () {
          if (previous !== undefined) {
            yield* interruptOnSignal(Deferred.await(previous), context.signal).pipe(
              Effect.catch((cause) => (context.signal.aborted ? Effect.void : Effect.fail(cause))),
            );
          }
          const value = yield* Ref.get(state);
          if (value.closed || context.signal.aborted) return undefined;
          previous = value.changed;
          const run = yield* Effect.try({
            try: () => {
              const stored = value.runs.get(request.runId);
              if (stored === undefined) throw new Error("Test run was not found");
              return structuredClone(snapshotOf(stored, service, clock));
            },
            catch: (cause) => cause,
          });
          const common = {
            run,
            observedAt: clock.now().toISOString(),
            epoch: "test",
            sequence: sequence + 1,
          };
          const frame: RunWatchFrame<RunSnapshot> =
            sequence === 0
              ? { ...common, kind: "snapshot", continuity: "state" }
              : { ...common, kind: "update" };
          return [frame, sequence + 1] as const;
        }),
      ).pipe(Stream.takeUntil((frame) => isTerminal(frame.run.status)));
    }),
  );
}
