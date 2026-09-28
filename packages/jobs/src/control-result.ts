import { currentTaskAncestry } from "@relkit/invocation";
import { Clock, Context, Effect, Layer, Result, Schema } from "effect";
import { durationToMillisEffect } from "./duration.js";
import { validateResultOptionsEffect } from "./trigger-validation.js";
import type { RunResultOptions } from "./trigger.types.js";
import { JobResultUnavailableError, TaskBlockingWaitError } from "./control-errors.js";
import type { JobsRuntime } from "./runtime.js";
import { isTerminal } from "./control-support.js";
import { observeJobs } from "./jobs-observability.js";
import type { ReadRun } from "./control-result.types.js";
export type { ReadRun } from "./control-result.types.js";
/** Injectable run snapshot reader for result polling.
 * @example const service = yield* ResultRunReader;
 */
export class ResultRunReader extends Context.Service<ResultRunReader, ReadRun>()(
  "relkit/jobs/ResultRunReader",
) {}
/** Provides a snapshot reader for deterministic result polling.
 * @param readRun - Snapshot reader implementation.
 * @returns A Layer for waitForResultEffect.
 * @example Effect.provide(waitForResultEffect(runtime, id, options), resultRunReaderLayer(readRun));
 */
export const resultRunReaderLayer = (readRun: ReadRun) => Layer.succeed(ResultRunReader, readRun);
/** Expected result polling failure retaining its original cause.
 * @example if (error instanceof JobResultFailure) console.log(error.message);
 */
export class JobResultFailure extends Schema.TaggedError<JobResultFailure>()("Jobs.ResultFailure", {
  cause: Schema.Defect(),
}) {}
/** Polls for a terminal result with Effect Clock and an owned abort listener.
 * @param runtime - Jobs runtime passed to the injected reader.
 * @param runId - Run identifier.
 * @param options - Timeout and cancellation settings.
 * @returns Run output or JobResultFailure.
 * @example Effect.runPromise(Effect.provide(waitForResultEffect(runtime, id, options), resultRunReaderLayer(readRun)));
 */
export const waitForResultEffect = Effect.fn("Jobs.waitForResultInternal")(
  (runtime: JobsRuntime, runId: string, options: RunResultOptions) =>
    observeJobs(
      "control.pollResult",
      Effect.gen(function* () {
        if (currentTaskAncestry() !== undefined)
          return yield* new JobResultFailure({ cause: new TaskBlockingWaitError() });
        const parsed = yield* Effect.mapError(
          validateResultOptionsEffect(options),
          (cause) => new JobResultFailure({ cause }),
        );
        const timeoutMs = yield* Effect.mapError(
          durationToMillisEffect(parsed.timeout),
          (cause) => new JobResultFailure({ cause }),
        );
        const readRun = yield* ResultRunReader;
        const signal = parsed.signal ?? new AbortController().signal;
        const started = yield* Clock.currentTimeMillis;
        const deadline = started + timeoutMs;
        return yield* Effect.acquireUseRelease(
          registerAbort(signal),
          (registration) =>
            Effect.raceFirst(
              Effect.gen(function* () {
                while (true) {
                  if (signal.aborted)
                    return yield* new JobResultFailure({
                      cause: signal.reason ?? new Error("Result observation aborted"),
                    });
                  const beforeRead = yield* Clock.currentTimeMillis;
                  if (beforeRead >= deadline)
                    return yield* new JobResultFailure({
                      cause: new JobResultUnavailableError(
                        "pending",
                        "Timed out waiting for the job result",
                      ),
                    });
                  const run = yield* Effect.timeoutOrElse(
                    Effect.tryPromise({
                      try: (effectSignal) =>
                        readRun(runtime, runId, AbortSignal.any([signal, effectSignal])),
                      catch: (cause) => new JobResultFailure({ cause }),
                    }),
                    {
                      duration: deadline - beforeRead,
                      orElse: () =>
                        Effect.fail(
                          new JobResultFailure({
                            cause: new JobResultUnavailableError(
                              "pending",
                              "Timed out waiting for the job result",
                            ),
                          }),
                        ),
                    },
                  );
                  if (isTerminal(run)) {
                    if (run.resultAvailability === "void") return undefined;
                    if (run.resultAvailability !== "available")
                      return yield* new JobResultFailure({
                        cause: new JobResultUnavailableError(run.resultAvailability),
                      });
                    return "output" in run ? run.output : undefined;
                  }
                  const now = yield* Clock.currentTimeMillis;
                  if (now >= deadline)
                    return yield* new JobResultFailure({
                      cause: new JobResultUnavailableError(
                        "pending",
                        "Timed out waiting for the job result",
                      ),
                    });
                  yield* Effect.sleep(Math.min(50, Math.max(1, deadline - now)));
                }
              }),
              Effect.flatMap(
                Effect.promise(() => registration.aborted),
                (cause) => Effect.fail(new JobResultFailure({ cause })),
              ),
            ),
          (registration) => Effect.sync(registration.dispose),
        );
      }),
    ),
);
/** Promise compatibility result polling.
 * @param runtime - Jobs runtime.
 * @param runId - Run identifier.
 * @param options - Timeout and cancellation settings.
 * @param readRun - Snapshot reader implementation.
 * @returns Run output.
 * @throws Original validation, cancellation, read, or availability error.
 * @example await waitForResult(runtime, id, options, readRun);
 */
export async function waitForResult(
  runtime: JobsRuntime,
  runId: string,
  options: RunResultOptions,
  readRun: ReadRun,
): Promise<unknown> {
  const result = await Effect.runPromise(
    Effect.result(
      Effect.provide(waitForResultEffect(runtime, runId, options), resultRunReaderLayer(readRun)),
    ),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
function registerAbort(signal: AbortSignal) {
  return Effect.try({
    try: () => {
      let notify!: (cause: unknown) => void;
      const aborted = new Promise<unknown>((resolve) => {
        notify = resolve;
      });
      const onAbort = () => notify(signal.reason ?? new Error("Result observation aborted"));
      try {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      } catch (cause) {
        signal.removeEventListener("abort", onAbort);
        throw cause;
      }
      return { aborted, dispose: () => signal.removeEventListener("abort", onAbort) };
    },
    catch: (cause) => new JobResultFailure({ cause }),
  });
}
