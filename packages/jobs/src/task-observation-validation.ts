import { Effect, Result, Schema } from "effect";
import { isRecord } from "./define-task-support.js";
import { observeJobs } from "./jobs-observability.js";
import type {
  NormalizedObservation,
  ObservationStreams,
  TaskObservation,
} from "./task-observation-validation.types.js";

/** An invalid task observation declaration.
 * @example new TaskObservationError({ reason: "Task observation must be an object" });
 */
export class TaskObservationError extends Schema.TaggedError<TaskObservationError>()(
  "Jobs.TaskObservationError",
  { reason: Schema.String },
) {}

/** Normalizes a task's progress and stream observation declarations in Effect.
 * @param value - Authored observation declaration.
 * @param progress - Declared progress schema, if any.
 * @param streams - Declared stream schemas.
 * @returns A frozen observation or TaskObservationError.
 * @example Effect.runPromise(copyObservationEffect(undefined, undefined, undefined));
 */
export const copyObservationEffect = Effect.fn("Jobs.copyObservation")(
  (value: unknown, progress: unknown, streams: ObservationStreams) =>
    observeJobs(
      "taskObservation.copy",
      Effect.try({
        try: (): NormalizedObservation => {
          const declaredStreamNames = streams === undefined ? [] : Object.keys(streams);
          if (value === undefined) {
            if (progress === undefined && declaredStreamNames.length === 0) return undefined;
            return Object.freeze({
              ...(progress === undefined ? {} : { progress: "live" as const }),
              ...(declaredStreamNames.length === 0
                ? {}
                : {
                    streams: Object.freeze(
                      Object.fromEntries(
                        declaredStreamNames.map((name) => [name, "live" as const]),
                      ),
                    ),
                  }),
            }) as TaskObservation;
          }
          if (!isRecord(value)) throw new TypeError("Task observation must be an object");
          if (
            value.progress !== undefined &&
            value.progress !== "live" &&
            value.progress !== "durable"
          ) {
            throw new TypeError('observation.progress must be "live" or "durable"');
          }
          if (value.progress !== undefined && progress === undefined) {
            throw new TypeError("Progress observation requires a progress schema");
          }
          let observedStreams: Record<string, "live" | "history"> | undefined;
          if (value.streams !== undefined) {
            if (!isRecord(value.streams) || streams === undefined) {
              throw new TypeError("Observed streams require declared task stream schemas");
            }
            observedStreams = {};
            for (const [name, guarantee] of Object.entries(value.streams)) {
              if (!(name in streams)) throw new TypeError(`Undeclared observed stream "${name}"`);
              if (guarantee !== "live" && guarantee !== "history") {
                throw new TypeError(`Invalid observation guarantee for stream "${name}"`);
              }
              observedStreams[name] = guarantee;
            }
          } else if (declaredStreamNames.length > 0) {
            observedStreams = Object.fromEntries(
              declaredStreamNames.map((name) => [name, "live" as const]),
            );
          }
          return Object.freeze({
            ...(value.progress === undefined
              ? progress === undefined
                ? {}
                : { progress: "live" as const }
              : { progress: value.progress }),
            ...(observedStreams === undefined ? {} : { streams: Object.freeze(observedStreams) }),
          }) as TaskObservation;
        },
        catch: (cause) =>
          new TaskObservationError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    ),
);

/** Synchronous task observation compatibility adapter.
 * @param value - Authored observation declaration.
 * @param progress - Declared progress schema, if any.
 * @param streams - Declared stream schemas.
 * @returns A frozen observation or undefined.
 * @throws TypeError when the declaration contradicts task schemas.
 * @example copyObservation(undefined, undefined, undefined);
 */
export function copyObservation(
  value: unknown,
  progress: unknown,
  streams: ObservationStreams,
): TaskObservation | undefined {
  const result = Effect.runSync(Effect.result(copyObservationEffect(value, progress, streams)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
