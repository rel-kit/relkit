import type { JsonValue } from "@relkit/contracts";
import { observeExecution } from "@relkit/runtime-effect";
import type { TaskAncestry } from "@relkit/invocation";
import {
  currentJobsRuntime,
  decodeJobWire,
  submitTask,
  validateCanonicalInput,
  type TaskContextBase,
} from "@relkit/jobs";
import type {
  TaskExecutionBinding,
  TaskExecutionEnvelope,
  TaskExecutor,
} from "@relkit/jobs/adapter";
import { Effect } from "effect";
import { enginePromise, engineTry, runEnginePromise } from "./engine-runtime.js";
import type { InvokeOptions } from "./invoke-types.js";
import { invokeEffect } from "./invoke.js";
import { materializeTaskContext } from "./task-context.js";
import { assertEnvelopeEffect, enrichBinding, lookupTask } from "./task-executor-support.js";
import type { TaskExecutorOptions } from "./task-executor.types.js";
import { taskTarget } from "./task-executor-target.js";
import { invocationTerminal } from "./invocation-observation.js";
export type { TaskExecutorOptions } from "./task-executor.types.js";

export { TaskExecutionError } from "./task-executor-errors.js";

/** Expose the native task executor contract backed by engine Effects.
 * @returns A native TaskExecutor forwarding execution into the engine Effect.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createTaskExecutor(options: TaskExecutorOptions): TaskExecutor {
  return Object.freeze({
    execute: (envelope: TaskExecutionEnvelope, binding: TaskExecutionBinding) =>
      executeTask(envelope, binding, options),
  });
}

/** Validate and execute a native task envelope without treating suspension as terminal failure.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding task output or the original failure/continuation; native suspension stays nonterminal.
 * @param envelope - Persisted execution or event-delivery envelope.
 * @param binding - Verified provider or native task binding.
 */
export const executeTaskEffect = Effect.fn("Engine.executeTask")((
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
  options: TaskExecutorOptions,
) => {
  let suspended = false;
  return observeExecution(
    "engine",
    "task.execute",
    executeTaskWorkflow(envelope, binding, options, () => {
      suspended = true;
    }),
    undefined,
    (exit) => invocationTerminal(exit, suspended),
  );
});

/**
 * Composes envelope validation, task context and invocation under one task operation.
 * @param envelope - Persisted execution or delivery input.
 * @param binding - Verified native provider authority.
 * @param options - Generation dependencies.
 * @param onSuspension - Marks a continuation before its opaque value leaves the invocation.
 * @returns A lazy workflow preserving failures, defects and nonterminal continuation values.
 */
const executeTaskWorkflow = Effect.fn("Engine.executeTask.workflow")(function* (
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
  options: TaskExecutorOptions,
  onSuspension: () => void,
) {
  const task = yield* engineTry(() => lookupTask(options.tasks, envelope.taskId));
  yield* assertEnvelopeEffect(task, envelope, binding);
  const executionBinding = enrichBinding(binding, envelope);
  const decoded = decodeJobWire(envelope.input);
  const input = yield* enginePromise(() =>
    Promise.resolve(validateCanonicalInput(task.input, decoded, task.inputWire)),
  );
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
  return yield* invokeEffect(invokeOptions, onSuspension);
});

/** Validate and execute a native task envelope without treating suspension as terminal failure.
 * @returns A Promise of task output; native suspension retains its original continuation value.
 * @param envelope - Persisted execution or event-delivery envelope.
 * @param binding - Verified provider or native task binding.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function executeTask(
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
  options: TaskExecutorOptions,
): Promise<unknown> {
  return runEnginePromise(
    executeTaskEffect(envelope, binding, options),
    undefined,
    options.effectRunner,
  );
}

/** Read the task executor from the current native jobs runtime.
 * @returns The active native task executor, or undefined outside a jobs runtime.
 */
export function executorFromCurrentRuntime(): TaskExecutor | undefined {
  return currentJobsRuntime()?.taskExecutor;
}
