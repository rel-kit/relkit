import { isRuntimeActivationFingerprint } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { admitObservabilityRecord } from "@relkit/observability";
import { Cause, Clock, Context, Deferred, Effect, Exit, Layer, Queue, Ref } from "effect";
import { recordsForTelemetry } from "./observability-records.js";
import type { SupervisorObservabilityOptions } from "./observability.types.js";
import type {
  SupervisorAppend,
  SupervisorAppendState,
  SupervisorObservabilityService,
} from "./observability-service.types.js";

/** Owned redacted lifecycle projections and serial append workflow. */
export class SupervisorObservabilityOwner extends Context.Service<
  SupervisorObservabilityOwner,
  SupervisorObservabilityService
>()("@relkit/supervisor/SupervisorObservabilityOwner") {}

/**
 * Acquires isolated, initially idle lifecycle delivery state.
 * @param options - Existing native sinks, redaction and explicit clock override.
 * @returns A scoped service; finite append workers start only when a record is admitted.
 * @remarks The queue remains lossless/unbounded, matching the original Promise tail rather than adding eviction.
 */
export function createSupervisorObservabilityLayer(options: SupervisorObservabilityOptions) {
  return Layer.effect(
    SupervisorObservabilityOwner,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const queue = yield* Queue.unbounded<SupervisorAppend>();
      const tail = yield* Deferred.make<void>();
      yield* Deferred.succeed(tail, undefined);
      const state = yield* Ref.make<SupervisorAppendState>({
        accepting: true,
        running: false,
        tail,
      });
      const now = options.now === undefined ? Clock.currentTimeMillis : Effect.sync(options.now);
      const worker = Effect.gen(function* () {
        while (true) {
          const next = yield* Ref.modify(state, (current) => {
            const item = Queue.takeUnsafe(queue);
            return [item, item === undefined ? { ...current, running: false } : current];
          });
          if (next === undefined || Exit.isFailure(next)) return;
          const item = next.value;
          let native: Promise<unknown> | undefined;
          yield* observeExecution(
            "supervisor",
            "observability.append",
            Effect.tryPromise({
              try: () => {
                native = Promise.resolve(options.append?.(item.record));
                return native;
              },
              catch: (error) => error,
            }).pipe(
              Effect.onExit((exit) =>
                Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) && native !== undefined
                  ? Effect.promise(() =>
                      native!.then(
                        () => undefined,
                        () => undefined,
                      ),
                    )
                  : Effect.void,
              ),
            ),
            () => ({ records: 1 }),
          ).pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.void,
            ),
            Effect.onExit(() => Deferred.succeed(item.done, undefined)),
          );
        }
      });
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Ref.update(state, (current) => ({ ...current, accepting: false }));
          yield* Effect.sync(() => {
            while (true) {
              const next = Queue.takeUnsafe(queue);
              if (next === undefined || Exit.isFailure(next)) break;
              Deferred.doneUnsafe(next.value.done, Effect.void);
            }
          });
          yield* Queue.shutdown(queue);
        }),
      );
      return SupervisorObservabilityOwner.of({
        emit: Effect.fn("SupervisorObservability.emit")((event) =>
          observeExecution(
            "supervisor",
            "observability.emit",
            Effect.gen(function* () {
              const instant = yield* now;
              const records = yield* Effect.try({
                try: () =>
                  recordsForTelemetry(
                    event,
                    (token) => {
                      const value = options.activationFingerprint;
                      const fingerprint = typeof value === "function" ? value(token, event) : value;
                      if (!isRuntimeActivationFingerprint(fingerprint))
                        throw new TypeError(
                          `Supervisor observability requires an activation fingerprint for generation-${token.generationToken}.`,
                        );
                      return fingerprint;
                    },
                    () => instant,
                  ),
                catch: (error) => {
                  if (error instanceof TypeError) return error;
                  throw error;
                },
              });
              const admitted = records.flatMap((item) => {
                const safe = admitObservabilityRecord(item.record, options.redaction);
                return safe === undefined ? [] : [{ ...item, safe }];
              });
              if (!(yield* Ref.get(state)).accepting)
                return yield* Effect.fail(new Error("Supervisor observability is closed."));
              // Admit the complete batch before borrowed sinks can reenter close/emit.
              for (const item of admitted) {
                if (options.append === undefined) continue;
                const done = yield* Deferred.make<void>();
                yield* Queue.offer(queue, { record: item.safe, done });
                const start = yield* Ref.modify(state, (current) => [
                  !current.running,
                  { ...current, running: true, tail: done },
                ]);
                if (start) yield* Effect.forkIn(worker, scope);
              }
              for (const item of admitted) {
                try {
                  options.collector?.collect(item.safe);
                  options.stream?.publishRecord(item.streamType, item.safe);
                } catch {
                  /* A sink has no lifecycle authority. */
                }
              }
            }),
            () => ({
              records:
                event.type !== "outcome"
                  ? 0
                  : event.outcome === "switch-succeeded" && event.previousGeneration !== undefined
                    ? 3
                    : 2,
            }),
          ).pipe(Effect.uninterruptible),
        ),
        flush: observeExecution(
          "supervisor",
          "observability.flush",
          Ref.get(state).pipe(Effect.flatMap((current) => Deferred.await(current.tail))),
          () => ({ batches: 1 }),
        ),
      });
    }),
  );
}
