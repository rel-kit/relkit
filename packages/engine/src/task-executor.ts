import type {
  InvocationContextFactory,
  InvocationIdSource,
  InvocationRunner,
  TaskAncestry,
} from "@relkit/invocation";
import { currentJobsRuntime } from "@relkit/jobs";
import type { JsonValue } from "@relkit/contracts";
import {
  decodeJobWire,
  validateCanonicalInput,
  type TaskContextBase,
  type TaskDescriptorAny,
} from "@relkit/jobs";
import type {
  TaskExecutionBinding,
  TaskExecutionEnvelope,
  TaskExecutor,
} from "@relkit/jobs/adapter";
import type { DependencyClientSources, DirectTaskInvoker } from "./dependencies.js";
import { submitTask } from "@relkit/jobs";
import type { FunctionRegistry } from "./registry.js";
import type { InvocationContext, InvocationTarget, InvokeOptions } from "./invoke-types.js";
import { invoke } from "./invoke.js";
import { materializeTaskContext } from "./task-context.js";
import { assertEnvelope, enrichBinding, lookupTask } from "./task-executor-support.js";

export interface TaskExecutorOptions {
  readonly tasks:
    Readonly<Record<string, TaskDescriptorAny>> | ReadonlyMap<string, TaskDescriptorAny>;
  readonly registry?: FunctionRegistry;
  readonly clients?: DependencyClientSources;
  readonly invokeTask?: DirectTaskInvoker;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly context?: InvocationContextFactory<TaskContextBase>;
  readonly idSource?: InvocationIdSource;
  readonly effectRunner?: InvocationRunner;
  readonly now?: () => number;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
}

export { TaskExecutionError } from "./task-executor-errors.js";

export function createTaskExecutor(options: TaskExecutorOptions): TaskExecutor {
  return Object.freeze({
    execute: (envelope: TaskExecutionEnvelope, binding: TaskExecutionBinding) =>
      executeTask(envelope, binding, options),
  });
}

export async function executeTask(
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
  options: TaskExecutorOptions,
): Promise<unknown> {
  const task = lookupTask(options.tasks, envelope.taskId);
  await assertEnvelope(task, envelope, binding);
  const executionBinding = enrichBinding(binding, envelope);
  const decoded = decodeJobWire(envelope.input);
  const input = await validateCanonicalInput(task.input, decoded, task.inputWire);
  const ancestry: TaskAncestry = {
    runId: envelope.runId,
    taskId: envelope.taskId,
    jobId: envelope.jobId,
    taskVersion: envelope.taskVersion,
    buildId: envelope.buildId,
    attempt: envelope.attempt ?? executionBinding.run.attempt ?? 1,
  };
  const target = taskTarget(task, options);
  const taskInvoker =
    options.invokeTask ??
    ((request) =>
      submitTask(
        lookupTask(options.tasks, request.taskId),
        request.input,
        request.options === undefined && request.signal === undefined
          ? undefined
          : {
              ...(request.options ?? {}),
              ...(request.signal === undefined ? {} : { signal: request.signal }),
            },
      ));
  const attempt = ancestry.attempt ?? 1;
  const invokeOptions: InvokeOptions<unknown, unknown, TaskContextBase> = {
    target,
    input: input as JsonValue,
    source: "job",
    signal: executionBinding.signal,
    ...(executionBinding.run.propagation?.correlationId === undefined
      ? {}
      : { correlationId: executionBinding.run.propagation.correlationId }),
    ...(executionBinding.run.propagation?.producer === undefined
      ? {}
      : { links: [executionBinding.run.propagation.producer] }),
    taskAncestry: ancestry,
    attempt,
    taskMetadata: {
      runId: envelope.runId,
      jobId: envelope.jobId,
      taskId: envelope.taskId,
      taskVersion: envelope.taskVersion,
      buildId: envelope.buildId,
      ...(executionBinding.run.serviceGeneration === undefined
        ? {}
        : { serviceGeneration: executionBinding.run.serviceGeneration }),
    },
    ...(executionBinding.isSuspension === undefined
      ? {}
      : { isSuspension: executionBinding.isSuspension }),
    skipInputValidation: true,
    skipOutputValidation: true,
    ...(executionBinding.run.deadlineMs === undefined
      ? {}
      : { deadlineMs: executionBinding.run.deadlineMs }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.clients === undefined ? {} : { clients: options.clients }),
    invokeTask: taskInvoker,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.idSource === undefined ? {} : { idSource: options.idSource }),
    ...(options.effectRunner === undefined ? {} : { effectRunner: options.effectRunner }),
    ...(options.now === undefined ? {} : { now: options.now }),
    hooks: {
      context: (contextOptions) =>
        materializeTaskContext({
          task,
          binding: executionBinding,
          record: contextOptions.invocation,
          signal: contextOptions.signal,
          env: contextOptions.env,
          time: contextOptions.time,
          ...(options.context === undefined ? {} : { context: options.context }),
          ...(options.clients === undefined ? {} : { clients: options.clients }),
          invokeTask: taskInvoker,
          ...(options.publications === undefined ? {} : { publications: options.publications }),
        }),
    },
    taskLifecycle: {
      taskId: task.id,
      ...(task.onStart === undefined
        ? {}
        : { onStart: (value, context) => task.onStart!(value as never, context as never) }),
      ...(task.onSuccess === undefined
        ? {}
        : { onSuccess: (value, context) => task.onSuccess!(value as never, context as never) }),
      ...(task.onFailure === undefined
        ? {}
        : {
            onFailure: (value, context) =>
              (
                task.onFailure as unknown as (
                  value: unknown,
                  context: TaskContextBase,
                ) => Promise<void>
              )(value, context),
          }),
    },
  };
  return invoke(invokeOptions);
}

function taskTarget(
  task: TaskDescriptorAny,
  options: TaskExecutorOptions,
): InvocationTarget<unknown, unknown, TaskContextBase> {
  const target: InvocationTarget<unknown, unknown, TaskContextBase> = {
    id: `task.${task.id}`,
    input: task.input,
    output: task.output,
    ...(task.dependencies === undefined
      ? {}
      : {
          dependencies:
            task.dependencies as unknown as import("./dependencies.js").DependencyDeclarations,
        }),
    ...(options.publications === undefined ? {} : { publications: options.publications }),
    ...(task.publishes === undefined ? {} : { publishes: task.publishes }),
    handler: (input, context) =>
      (task.handler as (value: never, context: TaskContextBase) => unknown)(
        input as never,
        context as TaskContextBase,
      ),
  };
  return target;
}

export function executorFromCurrentRuntime(): TaskExecutor | undefined {
  return currentJobsRuntime()?.taskExecutor;
}
