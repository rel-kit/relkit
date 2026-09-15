import { createDescriptorBase, deepFreeze, isDescriptor, normalizeId } from "@relkit/contracts";
import { assertTaskDescriptor, isTaskDescriptor } from "./define-task.js";
import { copyAdmission, copyClient } from "./job-validation.js";
import { copySchedules } from "./schedule-validation.js";
import type {
  DefineJobOptions,
  JobDescriptor,
  JobDescriptorAny,
  ScheduleDefinition,
} from "./job-types.js";
import { validateJobName } from "./job-name.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { submitJob } from "./submission.js";

/** Diagnostic code used when the one-release profile spelling is consumed as service. */
export const JOB_PROFILE_DEPRECATED_CODE = "RELKIT_JOB_PROFILE_DEPRECATED" as const;

/** Legacy retry shapes remain type-only available until the compatibility move. */
export type { RetryJitter, RetryPolicy } from "./job-types.js";

const forbiddenJobFields = [
  "handler",
  "target",
  "invoke",
  "input",
  "output",
  "errors",
  "execution",
  "dependencies",
  "publishes",
  "progress",
  "streams",
  "observation",
  "retry",
  "resources",
  "concurrency",
  "maxDuration",
  "maxElapsed",
  "logging",
  "onStart",
  "onSuccess",
  "onFailure",
] as const;

/**
 * Binds a task to a named job with immutable scheduling and client policy metadata.
 *
 * @example
 * ```ts
 * import { defineJob } from "@relkit/app/jobs";
 * import { defineTask } from "@relkit/app/tasks";
 * import { z } from "@relkit/app/schema";
 * const task = defineTask({
 *   id: "receipts.send",
 *   version: "1",
 *   input: z.object({ orderId: z.string() }),
 *   output: z.object({ sent: z.boolean() }),
 *   handler: async () => ({ sent: true }),
 * });
 * const job = defineJob({ name: "sendReceipt", task });
 * void job;
 * ```
 * @category Jobs
 * @since 0.4.1
 */
export function defineJob<
  const Name extends string,
  const Task extends TaskDescriptorAny,
  const Id extends string = Name,
>(
  options: DefineJobOptions<Name, Task, Id>,
): JobDescriptor<Name, Id, Task> {
  if (!isRecord(options)) throw new TypeError("Job options must be an object");
  for (const field of forbiddenJobFields) {
    if (hasOwn(options, field)) throw new TypeError(`Jobs cannot own task field ${field}`);
  }
  if (hasOwn(options, "service") && hasOwn(options, "profile")) {
    throw new TypeError('Job options cannot specify both "service" and deprecated "profile"');
  }
  const name = validateJobName(options.name) as Name;
  assertTaskDescriptor(options.task);
  const id = normalizeId(options.id ?? name) as unknown as Id;
  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const serviceValue = options.service ?? profile;
  const service = serviceValue === undefined ? undefined : normalizeId(serviceValue);
  const canonicalInput = options.task.inputWire ?? options.task.input;
  const schedules = copySchedules(options.schedules, {
    callerSchema: options.task.input,
    canonicalSchema: canonicalInput,
  }) as
    | readonly ScheduleDefinition<unknown>[]
    | undefined;
  const admission = copyAdmission(options.admission, canonicalInput);
  const client = copyClient(options.client, {
    progress: options.task.progress,
    streams: options.task.streams,
  });
  const base = createDescriptorBase("job", id, options);

  const descriptor = {
    ...base,
    name,
    task: options.task,
    input: options.task.input,
    output: options.task.output,
    ...(options.task.errors === undefined ? {} : { errors: options.task.errors }),
    ...(options.task.progress === undefined ? {} : { progress: options.task.progress }),
    ...(options.task.streams === undefined ? {} : { streams: options.task.streams }),
    execution: options.task.execution,
    ...(options.task.observation === undefined ? {} : { observation: options.task.observation }),
    ...(service === undefined ? {} : { service }),
    ...(profile === undefined ? {} : { profile }),
    ...(options.default === undefined ? {} : { default: options.default }),
    ...(schedules === undefined ? {} : { schedules }),
    ...(admission === undefined ? {} : { admission }),
    ...(client === undefined ? {} : { client }),
    trigger: (input: Parameters<JobDescriptor<Name, Id, Task>["trigger"]>[0], triggerOptions?: unknown) =>
      submitJob(
        descriptor as unknown as JobDescriptorAny,
        input,
        triggerOptions,
      ),
  };
  return deepFreeze(descriptor) as unknown as JobDescriptor<Name, Id, Task>;
}

export function isJobDescriptor(value: unknown): value is JobDescriptorAny {
  return isRecord(value) && isDescriptor(value, "job") && isTaskDescriptor(value.task);
}

export function assertJobDescriptor(value: unknown): asserts value is JobDescriptorAny {
  if (!isJobDescriptor(value)) throw new TypeError("Invalid job descriptor");
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
