import { Deferred, Effect } from "effect";
import { toPublicEnvelope } from "./failure.js";
import { callHookEffect } from "./validation.js";
import { completeStandaloneRecordEffect, StandaloneRecordError } from "./standalone-record.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  StandaloneFinisher,
  StandaloneFinisherOptions,
} from "./standalone-completion.types.js";

export type {
  StandaloneFinisher,
  StandaloneFinisherOptions,
  StandaloneOutcome,
} from "./standalone-completion.types.js";

/** Creates an idempotent Effect finalizer for a standalone invocation.
 * @param args - Record, hooks, clock, progress settlement, and signal cleanup.
 * @returns Effect and Promise finalization paths; completion may fail with `StandaloneRecordError`.
 * @example Effect.runSync(createStandaloneFinisherEffect({ record, options, now, settleProgress: undefined, unlink }));
 */
export function createStandaloneFinisherEffect<Context extends { readonly signal: AbortSignal }>(
  args: StandaloneFinisherOptions<Context>,
): Effect.Effect<StandaloneFinisher> {
  return observeInvocation(
    "standalone.finisher-create",
    Effect.gen(function* () {
      let completed = false;
      const completion = yield* Deferred.make<void, StandaloneRecordError>();
      const finishEffect: StandaloneFinisher["finishEffect"] = (outcome, error) =>
        observeInvocation(
          "standalone.finish",
          Effect.uninterruptible(
            Effect.gen(function* () {
              if (completed) {
                yield* Effect.exit(Deferred.await(completion));
                return;
              }
              completed = true;
              const result = yield* Effect.exit(
                Effect.gen(function* () {
                  yield* Effect.sync(() => args.settleProgress?.());
                  const record = yield* completeStandaloneRecordEffect(
                    args.record,
                    outcome,
                    args.now(),
                  );
                  yield* callHookEffect(args.options.onCompletion, {
                    record,
                    outcome,
                    ...(error === undefined ? {} : { error, publicError: toPublicEnvelope(error) }),
                  });
                  yield* callHookEffect(args.options.onRelease, { record, admitted: false });
                }).pipe(Effect.ensuring(Effect.sync(args.unlink))),
              );
              yield* Deferred.done(completion, result);
              return yield* result;
            }),
          ),
        );
      const finish: StandaloneFinisher["finish"] = async (outcome, error) => {
        try {
          await Effect.runPromise(finishEffect(outcome, error));
        } catch (cause) {
          if (cause instanceof StandaloneRecordError) throw new RangeError(cause.message);
          throw cause;
        }
      };
      return { finishEffect, finish };
    }),
  );
}

/** Creates the Promise finalizer used by standalone dispatch.
 * @param args - Record, hooks, clock, progress settlement, and signal cleanup.
 * @returns An idempotent Promise finalizer.
 * @throws An unexpected defect if finalizer creation fails.
 * @example createStandaloneFinisher({ record, options, now, settleProgress: undefined, unlink });
 */
export function createStandaloneFinisher<Context extends { readonly signal: AbortSignal }>(
  args: StandaloneFinisherOptions<Context>,
): StandaloneFinisher["finish"] {
  return runInvocationSync(createStandaloneFinisherEffect(args)).finish;
}
