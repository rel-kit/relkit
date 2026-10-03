import type { JsonValue } from "@relkit/contracts";
import { makeContext } from "@relkit/invocation";
import {
  assertRfc3339Instant,
  createTaskProgressEmitter,
  createTaskStreamEmitter,
  durationToMillis,
  type TaskContextBase,
  taskOperationIdentity,
} from "@relkit/jobs";
import { JobsCapabilityError } from "@relkit/jobs/adapter";
import { observeExecution } from "@relkit/runtime-effect";
import { Clock, Effect } from "effect";
import { createContextEffect } from "./context.js";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import type { TaskContextMaterializationOptions } from "./task-context.types.js";
export type { TaskContextMaterializationOptions } from "./task-context.types.js";

/** Construct a native task context with guarded generation-bound clients.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding a guarded task context and preserving native context-factory failures.
 */
export const materializeTaskContextEffect = Effect.fn("Engine.materializeTaskContext")(
  function* (options: TaskContextMaterializationOptions) {
    const base = yield* enginePromise(() =>
      Promise.resolve(
        makeContext(options.context, options.record, options.signal, options.env, options.time),
      ),
    );
    const run = Object.freeze({
      runId: options.binding.run.runId,
      jobId: options.binding.run.jobId,
      taskId: options.binding.run.taskId,
      taskVersion: options.binding.run.taskVersion,
      buildId: options.binding.run.buildId,
      service: options.binding.run.service ?? "default",
      attempt: options.binding.run.attempt ?? 1,
      acceptedAt:
        options.binding.run.acceptedAt ?? new Date(yield* Clock.currentTimeMillis).toISOString(),
      ...(options.binding.run.scheduledFor === undefined
        ? {}
        : { scheduledFor: options.binding.run.scheduledFor }),
      ...(options.binding.run.parentRunId === undefined
        ? {}
        : { parentRunId: options.binding.run.parentRunId }),
      ...(options.binding.run.acceptanceIdentity === undefined
        ? {}
        : { acceptanceIdentity: options.binding.run.acceptanceIdentity }),
    });
    const acceptanceIdentity =
      options.binding.run.acceptanceIdentity ??
      `${options.binding.run.jobId}:${options.binding.run.taskId}:${options.binding.run.taskVersion}:${options.binding.run.buildId}`;
    const generation = `${acceptanceIdentity}:attempt-${run.attempt}`;
    const taskBase = {
      ...base,
      run,
      idempotencyKey: (operation: string) => taskOperationIdentity(acceptanceIdentity, operation),
    };
    const withProgress =
      options.task.progress === undefined
        ? taskBase
        : {
            ...taskBase,
            progress: createTaskProgressEmitter(options.task.progress, {
              signal: options.signal,
              durable: options.task.observation?.progress === "durable",
              generation,
              requireGeneration: options.task.observation?.progress === "durable",
              ...(options.binding.progress === undefined
                ? {}
                : { sink: (value: unknown) => options.binding.progress!.emit(value as JsonValue) }),
            }),
          };
    const withStreams = Object.entries(options.task.streams ?? {}).reduce<Record<string, unknown>>(
      (current, [name, schema]) => {
        const writer = options.binding.streams?.[name];
        current[name] = createTaskStreamEmitter(schema, {
          name,
          generation,
          durable: options.task.observation?.streams?.[name] === "history",
          requireGeneration: options.task.observation?.streams?.[name] === "history",
          signal: options.signal,
          ...(writer === undefined
            ? {}
            : { sink: (value: unknown) => writer.emit(value as JsonValue) }),
        });
        return current;
      },
      {},
    );
    const withDurableControls =
      options.task.execution === "durable"
        ? {
            ...withProgress,
            sleep: (
              duration: import("@relkit/jobs").DurationInput,
              sleepOptions: { readonly key: string },
            ) => durableSleep(options, duration, sleepOptions.key),
            sleepUntil: (instant: string, sleepOptions: { readonly key: string }) =>
              durableSleepUntil(options, instant, sleepOptions.key),
          }
        : withProgress;
    const enriched =
      Object.keys(withStreams).length === 0
        ? withDurableControls
        : { ...withDurableControls, streams: Object.freeze(withStreams) };
    return yield* createContextEffect(enriched as TaskContextBase, {
      ownerId: options.task.id,
      ...(options.task.dependencies === undefined
        ? {}
        : {
            dependencies: options.task
              .dependencies as unknown as import("./dependencies.js").DependencyDeclarations,
          }),
      ...(options.publications === undefined ? {} : { publications: options.publications }),
      ...(options.clients === undefined ? {} : { clients: options.clients }),
      ...(options.invokeTask === undefined ? {} : { invokeTask: options.invokeTask }),
    });
  },
  (effect) => observeExecution("engine", "materializeTaskContext", effect),
);

/** Construct a native task context with guarded generation-bound clients.
 * @returns A Promise of the native task context with guarded clients and durable sleep.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function materializeTaskContext(
  options: TaskContextMaterializationOptions,
): Promise<TaskContextBase> {
  return runEnginePromise(materializeTaskContextEffect(options));
}

/** Delegate sleep to the native task provider so waiting survives suspension.
 * @returns The provider's Promise for a durable relative sleep.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param duration - Requested durable sleep duration.
 * @param key - Stable lookup or idempotency key.
 */
function durableSleep(
  options: TaskContextMaterializationOptions,
  duration: import("@relkit/jobs").DurationInput,
  key: string,
): Promise<void> {
  if (options.binding.sleep === undefined) throw new JobsCapabilityError("durable-sleep");
  return options.binding.sleep.sleep(key, durationToMillis(duration));
}

/** Delegate an absolute durable wake-up time to the native task provider.
 * @returns The provider's Promise for a durable absolute wake-up time.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param instant - Requested durable wake-up instant.
 * @param key - Stable lookup or idempotency key.
 */
function durableSleepUntil(
  options: TaskContextMaterializationOptions,
  instant: string,
  key: string,
): Promise<void> {
  assertRfc3339Instant(instant, "task.sleepUntil");
  if (options.binding.sleep?.sleepUntil === undefined)
    throw new JobsCapabilityError("durable-sleep-until");
  return options.binding.sleep.sleepUntil(key, instant);
}
