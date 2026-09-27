import { type InferInput, type StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import { assertJobNameEffect } from "./job-name.js";
import { observeJobs } from "./jobs-observability.js";
import { createEmission } from "./task-progress-emission.js";
import { TaskEmissionFailure } from "./task-progress-error.js";
import type {
  EffectTaskEmitter,
  TaskEmitterOptions,
  TaskStreamEmitterOptions,
} from "./task-progress.types.js";
export { TaskEmissionError, TaskEmissionFailure } from "./task-progress-error.js";
export type {
  TaskEmissionSink,
  TaskEmitterOptions,
  TaskStreamEmitterOptions,
  TaskStreamSink,
  TaskEmissionErrorCode,
  EffectTaskEmitter,
} from "./task-progress.types.js";
/** Creates a validated progress emitter in Effect.
 * @param schema - Schema for each emitted item.
 * @param options - Delivery and retention settings.
 * @returns An Effect emitter or TaskEmissionFailure.
 * @example Effect.runSync(createTaskProgressEmitterEffect(z.string()));
 */
export const createTaskProgressEmitterEffect = Effect.fn("Jobs.createTaskProgressEmitter")(
  <S extends StandardSchemaV1>(schema: S, options: TaskEmitterOptions = {}) =>
    observeJobs(
      "task.createProgressEmitter",
      Effect.try({
        try: () => createEmission(schema, options, "progress"),
        catch: (cause) => new TaskEmissionFailure({ code: "RELKIT_TASK_PROGRESS_INVALID", cause }),
      }),
    ),
);
/** Compatibility factory for validated progress emitters.
 * @param schema - Schema for each emitted item.
 * @param options - Delivery and retention settings.
 * @returns An emitter with Promise and Effect operations.
 * @throws TypeError if the configured byte limit is invalid.
 * @example createTaskProgressEmitter(z.string());
 */
export function createTaskProgressEmitter<S extends StandardSchemaV1>(
  schema: S,
  options: TaskEmitterOptions = {},
): EffectTaskEmitter<InferInput<S>> {
  const result = Effect.runSync(Effect.result(createTaskProgressEmitterEffect(schema, options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Creates a named stream emitter in Effect.
 * @param schema - Schema for each emitted item.
 * @param options - Stream name and delivery settings.
 * @returns An Effect emitter or TaskEmissionFailure.
 * @example Effect.runSync(createTaskStreamEmitterEffect(z.string(), { name: "events" }));
 */
export const createTaskStreamEmitterEffect = Effect.fn("Jobs.createTaskStreamEmitter")(
  <S extends StandardSchemaV1>(schema: S, options: TaskStreamEmitterOptions) =>
    observeJobs(
      "task.createStreamEmitter",
      Effect.gen(function* () {
        yield* Effect.mapError(
          assertJobNameEffect(options.name, "task stream name"),
          (cause) =>
            new TaskEmissionFailure({
              code: "RELKIT_TASK_STREAM_INVALID",
              cause: new TypeError(cause.reason),
            }),
        );
        const name = options.name;
        const { sink, generation, ...baseOptions } = options;
        const emitterOptions: TaskEmitterOptions = {
          ...baseOptions,
          ...(sink === undefined
            ? {}
            : {
                sink: (value, signal) =>
                  sink(value, signal, {
                    name,
                    ...(generation === undefined ? {} : { generation }),
                  }),
              }),
          ...(generation === undefined ? {} : { generation }),
        };
        return yield* Effect.try({
          try: () => createEmission(schema, emitterOptions, "stream"),
          catch: (cause) => new TaskEmissionFailure({ code: "RELKIT_TASK_STREAM_INVALID", cause }),
        });
      }),
    ),
);
/** Compatibility factory for named stream emitters.
 * @param schema - Schema for each emitted item.
 * @param options - Stream name and delivery settings.
 * @returns An emitter with Promise and Effect operations.
 * @throws TypeError for invalid names or byte limits.
 * @example createTaskStreamEmitter(z.string(), { name: "events" });
 */
export function createTaskStreamEmitter<S extends StandardSchemaV1>(
  schema: S,
  options: TaskStreamEmitterOptions,
): EffectTaskEmitter<InferInput<S>> {
  const result = Effect.runSync(Effect.result(createTaskStreamEmitterEffect(schema, options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
