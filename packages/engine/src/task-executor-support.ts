import { canonicalJson } from "@relkit/contracts";
import type { TaskContextBase, TaskDescriptorAny } from "@relkit/jobs";
import type { TaskExecutionBinding, TaskExecutionEnvelope } from "@relkit/jobs/adapter";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import { TaskExecutionError } from "./task-executor-errors.js";

/** Add envelope identity and trace propagation to a native task execution binding.
 * @returns The original native capabilities plus persisted execution metadata.
 * @param binding - Verified provider or native task binding.
 * @param envelope - Persisted execution or event-delivery envelope.
 */
export function enrichBinding(
  binding: TaskExecutionBinding,
  envelope: TaskExecutionEnvelope,
): TaskExecutionBinding {
  return Object.freeze({
    ...binding,
    run: Object.freeze({
      ...binding.run,
      ...(envelope.acceptedAt === undefined || binding.run.acceptedAt !== undefined
        ? {}
        : { acceptedAt: envelope.acceptedAt }),
      ...(envelope.scheduledFor === undefined || binding.run.scheduledFor !== undefined
        ? {}
        : { scheduledFor: envelope.scheduledFor }),
      ...(envelope.parentRunId === undefined || binding.run.parentRunId !== undefined
        ? {}
        : { parentRunId: envelope.parentRunId }),
      ...(envelope.service === undefined || binding.run.service !== undefined
        ? {}
        : { service: envelope.service }),
      ...(envelope.serviceGeneration === undefined || binding.run.serviceGeneration !== undefined
        ? {}
        : { serviceGeneration: envelope.serviceGeneration }),
      ...(envelope.scope === undefined || binding.run.scope !== undefined
        ? {}
        : { scope: envelope.scope }),
      ...(envelope.inputSchemaHash === undefined || binding.run.inputSchemaHash !== undefined
        ? {}
        : { inputSchemaHash: envelope.inputSchemaHash }),
      ...(envelope.acceptanceIdentity === undefined || binding.run.acceptanceIdentity !== undefined
        ? {}
        : { acceptanceIdentity: envelope.acceptanceIdentity }),
      ...(envelope.occurrenceIdentity === undefined || binding.run.occurrenceIdentity !== undefined
        ? {}
        : { occurrenceIdentity: envelope.occurrenceIdentity }),
      ...(envelope.propagation === undefined || binding.run.propagation !== undefined
        ? {}
        : { propagation: envelope.propagation }),
      ...(envelope.attempt === undefined || binding.run.attempt !== undefined
        ? {}
        : { attempt: envelope.attempt }),
    }),
  });
}

/** Invoke the task failure hook while keeping hook failure advisory.
 * @returns A Promise completing after the hook and any safe warning.
 * @param task - Registered native task descriptor.
 * @param cause - Original native rejection or execution cause.
 * @param context - Active native invocation or task context.
 */
export async function safeFailureHook(
  task: TaskDescriptorAny,
  cause: unknown,
  context: TaskContextBase,
): Promise<void> {
  try {
    await callTaskHook(task.onFailure, cause, context);
  } catch {
    context.log.warn("Task failure hook failed", { taskId: task.id });
  }
}

/** Run a native task hook through the shared advisory hook boundary.
 * @returns A Promise completing after the advisory native hook settles.
 * @param hook - Optional advisory callback; observer failures cannot change execution.
 * @param first - Input, output or failure value supplied to the lifecycle hook.
 * @param context - Active native invocation or task context.
 */
export async function callTaskHook(
  hook: ((...args: never[]) => Promise<void>) | undefined,
  first: unknown,
  context: TaskContextBase,
): Promise<void> {
  if (hook !== undefined) {
    await (hook as unknown as (value: unknown, context: TaskContextBase) => Promise<void>)(
      first,
      context,
    );
  }
}

/** Find a registered task descriptor or reject an unknown task identity.
 * @returns The registered descriptor; unknown identities throw TaskExecutionError.
 * @param tasks - Explicit task descriptor lookup.
 * @param taskId - Canonical task identifier from the persisted execution envelope.
 */
export function lookupTask(
  tasks: Readonly<Record<string, TaskDescriptorAny>> | ReadonlyMap<string, TaskDescriptorAny>,
  taskId: string,
): TaskDescriptorAny {
  const task =
    tasks instanceof Map
      ? tasks.get(taskId)
      : (tasks as Readonly<Record<string, TaskDescriptorAny>>)[taskId];
  if (task === undefined) throw new TaskExecutionError(`Task "${taskId}" is not registered`);
  return task;
}

/** Validate task identity, version and native binding before handler execution.
 * @returns A lazy Effect failing with TaskExecutionError when envelope and native binding disagree.
 * @param task - Registered native task descriptor.
 * @param envelope - Persisted execution or event-delivery envelope.
 * @param binding - Verified provider or native task binding.
 */
export const assertEnvelopeEffect = Effect.fn("Engine.assertEnvelope")(
  function* (
    task: TaskDescriptorAny,
    envelope: TaskExecutionEnvelope,
    binding: TaskExecutionBinding,
  ) {
    if (
      envelope.taskId !== task.id ||
      envelope.taskVersion !== task.version ||
      envelope.taskId !== binding.run.taskId ||
      envelope.runId !== binding.run.runId ||
      envelope.jobId !== binding.run.jobId ||
      envelope.taskVersion !== binding.run.taskVersion
    ) {
      return yield* Effect.fail(
        new TaskExecutionError(
          "Native task envelope does not match the verified execution binding",
        ),
      );
    }
    if (envelope.buildId !== binding.run.buildId)
      return yield* Effect.fail(
        new TaskExecutionError("Task build is not pinned to the native run"),
      );
    if (
      envelope.inputSchemaHash !== undefined &&
      binding.run.inputSchemaHash !== undefined &&
      envelope.inputSchemaHash !== binding.run.inputSchemaHash
    ) {
      return yield* Effect.fail(
        new TaskExecutionError("Task input schema is not pinned to the native run"),
      );
    }
    if (
      envelope.scope !== undefined &&
      binding.run.scope !== undefined &&
      envelope.scope !== binding.run.scope
    ) {
      return yield* Effect.fail(
        new TaskExecutionError("Task scope is not pinned to the native run"),
      );
    }
    if (
      envelope.acceptanceIdentity !== undefined &&
      binding.run.acceptanceIdentity !== undefined &&
      envelope.acceptanceIdentity !== binding.run.acceptanceIdentity
    ) {
      return yield* Effect.fail(
        new TaskExecutionError("Task acceptance identity is not pinned to the native run"),
      );
    }
    if (
      envelope.attempt !== undefined &&
      (!Number.isSafeInteger(envelope.attempt) || envelope.attempt < 1)
    ) {
      return yield* Effect.fail(new TaskExecutionError("Native task envelope attempt is invalid"));
    }
    if (envelope.inputHash !== undefined) {
      const encoded = canonicalJson(envelope.input);
      const digest = yield* enginePromise(() =>
        Promise.resolve(
          globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded)),
        ),
      );
      const actual = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      if (actual !== envelope.inputHash)
        return yield* Effect.fail(new TaskExecutionError("Native task input hash is invalid"));
    }
  },
  (effect) => observeExecution("engine", "assertEnvelope", effect),
);

/** Validate task identity, version and native binding before handler execution.
 * @returns A Promise completing when task identity and binding validation succeed.
 * @param task - Registered native task descriptor.
 * @param envelope - Persisted execution or event-delivery envelope.
 * @param binding - Verified provider or native task binding.
 */
export async function assertEnvelope(
  task: TaskDescriptorAny,
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
): Promise<void> {
  return runEnginePromise(assertEnvelopeEffect(task, envelope, binding));
}
