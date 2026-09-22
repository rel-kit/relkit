import { canonicalJson } from "@relkit/contracts";
import type { TaskExecutionBinding, TaskExecutionEnvelope } from "@relkit/jobs/adapter";
import type { TaskContextBase, TaskDescriptorAny } from "@relkit/jobs";
import { TaskExecutionError } from "./task-executor-errors.js";

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

export async function assertEnvelope(
  task: TaskDescriptorAny,
  envelope: TaskExecutionEnvelope,
  binding: TaskExecutionBinding,
): Promise<void> {
  if (
    envelope.taskId !== task.id ||
    envelope.taskVersion !== task.version ||
    envelope.taskId !== binding.run.taskId ||
    envelope.runId !== binding.run.runId ||
    envelope.jobId !== binding.run.jobId ||
    envelope.taskVersion !== binding.run.taskVersion
  ) {
    throw new TaskExecutionError(
      "Native task envelope does not match the verified execution binding",
    );
  }
  if (envelope.buildId !== binding.run.buildId)
    throw new TaskExecutionError("Task build is not pinned to the native run");
  if (
    envelope.inputSchemaHash !== undefined &&
    binding.run.inputSchemaHash !== undefined &&
    envelope.inputSchemaHash !== binding.run.inputSchemaHash
  ) {
    throw new TaskExecutionError("Task input schema is not pinned to the native run");
  }
  if (
    envelope.scope !== undefined &&
    binding.run.scope !== undefined &&
    envelope.scope !== binding.run.scope
  ) {
    throw new TaskExecutionError("Task scope is not pinned to the native run");
  }
  if (
    envelope.acceptanceIdentity !== undefined &&
    binding.run.acceptanceIdentity !== undefined &&
    envelope.acceptanceIdentity !== binding.run.acceptanceIdentity
  ) {
    throw new TaskExecutionError("Task acceptance identity is not pinned to the native run");
  }
  if (
    envelope.attempt !== undefined &&
    (!Number.isSafeInteger(envelope.attempt) || envelope.attempt < 1)
  ) {
    throw new TaskExecutionError("Native task envelope attempt is invalid");
  }
  if (envelope.inputHash !== undefined) {
    const encoded = canonicalJson(envelope.input);
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(encoded),
    );
    const actual = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    if (actual !== envelope.inputHash)
      throw new TaskExecutionError("Native task input hash is invalid");
  }
}
