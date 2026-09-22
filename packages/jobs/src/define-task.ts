import { createDescriptorBase, deepFreeze, isDescriptor } from "@relkit/contracts";
import type { ErrorDescriptorAny } from "@relkit/functions";
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";
import {
  assertSchema,
  assertCanonicalSchemaSupport,
  assertCanonicalStreamSupport,
  assertInputWireSupport,
  copyConcurrency,
  copyDependencies,
  copyErrors,
  copyLogging,
  copyObservation,
  copyResources,
  copyStreams,
  duration,
  normalizeRetry,
  normalizeVersion,
} from "./task-validation.js";
import { copyTaskTags } from "./task-policy-validation.js";
import { assertHook, copyStrings, hasOwn, isRecord, isSchema } from "./define-task-support.js";
import type {
  DefineTaskOptions,
  TaskDependencies,
  TaskDescriptor,
  TaskDescriptorAny,
  TaskExecution,
  TaskStreamSchemas,
  PublishedEventName,
} from "./task-types.js";
import { submitTask } from "./submission.js";
const unsupportedTaskFields = ["invoke", "target"] as const;

/**
 * Declares a typed task with an immutable execution contract and handler.
 *
 * @example
 * ```ts
 * import { defineTask } from "@relkit/app/tasks";
 * import { z } from "@relkit/app/schema";
 * const exportOrders = defineTask({
 *   id: "orders.export",
 *   version: "1",
 *   input: z.object({ orderIds: z.array(z.string()) }),
 *   output: z.object({ exported: z.number() }),
 *   handler: async ({ orderIds }) => ({ exported: orderIds.length }),
 * });
 * void exportOrders;
 * ```
 * @category Jobs
 * @since 0.4.1
 */
export function defineTask<
  const Id extends string,
  const Version extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const Dependencies extends TaskDependencies = {},
  const Errors extends readonly ErrorDescriptorAny[] = readonly [],
  const Publishes extends readonly PublishedEventName[] = readonly [],
  const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
  const Streams extends TaskStreamSchemas = {},
  const Execution extends TaskExecution = "durable",
>(
  options: DefineTaskOptions<
    Id,
    Version,
    InputSchema,
    OutputSchema,
    Dependencies,
    Errors,
    Publishes,
    ProgressSchema,
    Streams,
    Execution
  >,
): TaskDescriptor<
  Id,
  Version,
  InputSchema,
  OutputSchema,
  Dependencies,
  Errors,
  Publishes,
  ProgressSchema,
  Streams,
  Execution
> {
  if (!isRecord(options)) throw new TypeError("Task options must be an object");
  for (const field of unsupportedTaskFields) {
    if (hasOwn(options, field)) throw new TypeError(`Tasks cannot own ${field}`);
  }
  if (typeof options.handler !== "function") throw new TypeError("Task handler is required");
  assertSchema(options.input, "Task input");
  assertSchema(options.output, "Task output");
  assertCanonicalSchemaSupport(options.output, "Task output", true);
  if (options.inputWire !== undefined) assertSchema(options.inputWire, "Task inputWire");
  assertInputWireSupport(options.input, options.inputWire);

  const id = String(normalizeVersion(options.id)) as Id;
  const version = String(normalizeVersion(options.version)) as Version;
  const execution = options.execution ?? "durable";
  if (execution !== "durable" && execution !== "retryable") {
    throw new TypeError('Task execution must be "durable" or "retryable"');
  }
  const progress = options.progress;
  if (progress !== undefined) {
    assertSchema(progress, "Task progress");
    assertCanonicalSchemaSupport(progress, "Task progress");
  }
  const streams = copyStreams(options.streams);
  assertCanonicalStreamSupport(streams);
  const observation = copyObservation(options.observation, progress, streams);
  const maxDuration =
    options.maxDuration === undefined
      ? undefined
      : duration(options.maxDuration, "maxDuration", true);
  const maxElapsed =
    options.maxElapsed === undefined ? undefined : duration(options.maxElapsed, "maxElapsed", true);
  const errors = copyErrors(options.errors);
  const dependencies = copyDependencies<Dependencies>(options.dependencies);
  const publishes = copyStrings(options.publishes, "publishes");
  const tags = copyTaskTags(options.tags);
  const resources = copyResources(options.resources);
  const concurrency = copyConcurrency(options.concurrency, options.inputWire ?? options.input);
  const logging = copyLogging(options.logging);
  assertHook(options.onStart, "onStart");
  assertHook(options.onSuccess, "onSuccess");
  assertHook(options.onFailure, "onFailure");

  const base = createDescriptorBase(
    "task",
    id,
    tags === undefined ? options : { ...options, tags },
  );
  const descriptor = {
    ...base,
    version,
    execution,
    input: options.input,
    ...(options.inputWire === undefined ? {} : { inputWire: options.inputWire }),
    output: options.output,
    ...(errors === undefined ? {} : { errors }),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(publishes === undefined ? {} : { publishes }),
    ...(progress === undefined ? {} : { progress }),
    ...(streams === undefined ? {} : { streams }),
    ...(observation === undefined ? {} : { observation }),
    retry: normalizeRetry(options.retry),
    ...(resources === undefined ? {} : { resources }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(maxDuration === undefined ? {} : { maxDuration }),
    ...(maxElapsed === undefined ? {} : { maxElapsed }),
    ...(logging === undefined ? {} : { logging }),
    ...(options.onStart === undefined ? {} : { onStart: options.onStart }),
    ...(options.onSuccess === undefined ? {} : { onSuccess: options.onSuccess }),
    ...(options.onFailure === undefined ? {} : { onFailure: options.onFailure }),
    handler: options.handler,
    trigger: (input: InferInput<InputSchema>, triggerOptions?: unknown) =>
      submitTask(descriptor as unknown as TaskDescriptorAny, input, triggerOptions),
  };
  return deepFreeze(descriptor) as unknown as TaskDescriptor<
    Id,
    Version,
    InputSchema,
    OutputSchema,
    Dependencies,
    Errors,
    Publishes,
    ProgressSchema,
    Streams,
    Execution
  >;
}
export function isTaskDescriptor(value: unknown): value is TaskDescriptorAny {
  return (
    isRecord(value) &&
    isDescriptor(value, "task") &&
    isSchema(value.input) &&
    isSchema(value.output) &&
    value.execution !== undefined &&
    (value.execution === "durable" || value.execution === "retryable") &&
    typeof value.handler === "function" &&
    typeof value.version === "string" &&
    !hasOwn(value, "target") &&
    !hasOwn(value, "invoke")
  );
}

export function assertTaskDescriptor(value: unknown): asserts value is TaskDescriptorAny {
  if (!isTaskDescriptor(value)) throw new TypeError("Job task must be a task descriptor");
}
