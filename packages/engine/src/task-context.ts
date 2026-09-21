import type { InvocationContextOptions, InvocationRecord, PublicClock } from "@relkit/invocation";
import { makeContext } from "@relkit/invocation";
import type { JsonValue } from "@relkit/contracts";
import {
  assertRfc3339Instant,
  createTaskProgressEmitter,
  createTaskStreamEmitter,
  durationToMillis,
  type TaskContextBase,
  type TaskDescriptorAny,
  taskOperationIdentity,
} from "@relkit/jobs";
import type { TaskExecutionBinding } from "@relkit/jobs/adapter";
import { JobsCapabilityError } from "@relkit/jobs/adapter";
import { createContext } from "./context.js";
import type { DependencyClientSources, DirectTaskInvoker } from "./dependencies.js";

export interface TaskContextMaterializationOptions {
  readonly task: TaskDescriptorAny;
  readonly binding: TaskExecutionBinding;
  readonly record: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
  readonly context?: (
    options: InvocationContextOptions,
  ) => Promise<TaskContextBase> | TaskContextBase;
  readonly clients?: DependencyClientSources;
  readonly invokeTask?: DirectTaskInvoker;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
}

export async function materializeTaskContext(
  options: TaskContextMaterializationOptions,
): Promise<TaskContextBase> {
  const base = await makeContext(
    options.context,
    options.record,
    options.signal,
    options.env,
    options.time,
  );
  const run = Object.freeze({
    runId: options.binding.run.runId,
    jobId: options.binding.run.jobId,
    taskId: options.binding.run.taskId,
    taskVersion: options.binding.run.taskVersion,
    buildId: options.binding.run.buildId,
    service: options.binding.run.service ?? "default",
    attempt: options.binding.run.attempt ?? 1,
    acceptedAt: options.binding.run.acceptedAt ?? new Date().toISOString(),
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
  return createContext(enriched as TaskContextBase, {
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
  }) as TaskContextBase;
}

function durableSleep(
  options: TaskContextMaterializationOptions,
  duration: import("@relkit/jobs").DurationInput,
  key: string,
): Promise<void> {
  if (options.binding.sleep === undefined) throw new JobsCapabilityError("durable-sleep");
  return options.binding.sleep.sleep(key, durationToMillis(duration));
}

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
