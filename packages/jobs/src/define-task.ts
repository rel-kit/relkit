import type { ErrorDescriptorAny } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result, Schema } from "effect";
import { defineTaskValue, isTaskDescriptorValue } from "./define-task-value.js";
import { observeJobs } from "./jobs-observability.js";
import type {
  DefineTaskOptions,
  PublishedEventName,
  TaskDependencies,
  TaskDescriptor,
  TaskDescriptorAny,
  TaskExecution,
  TaskStreamSchemas,
} from "./task-types.js";
/** Expected task definition failure, retaining the original validation error.
 * @example if (error instanceof TaskDefinitionFailure) console.log(error.message);
 */
export class TaskDefinitionFailure extends Schema.TaggedError<TaskDefinitionFailure>()(
  "Jobs.TaskDefinitionFailure",
  { cause: Schema.Defect() },
) {}
/** Defines an immutable task descriptor in Effect.
 * @param options - Task identity, schemas, handler, and execution policy.
 * @returns A task descriptor or TaskDefinitionFailure.
 * @example Effect.runSync(defineTaskEffect({ id: "send", version: "1", input, output, handler }));
 */
export const defineTaskEffect = Effect.fn("Jobs.defineTask")(
  <
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
  ) =>
    observeJobs(
      "task.define",
      Effect.try({
        try: () => defineTaskValue(options),
        catch: (cause) => new TaskDefinitionFailure({ cause }),
      }),
    ),
);
/** Declares a typed immutable task with an execution contract and handler.
 * @param options - Task identity, schemas, handler, and execution policy.
 * @returns A frozen task descriptor.
 * @throws Original validation error for invalid definitions.
 * @example defineTask({ id: "send", version: "1", input, output, handler });
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
  const result = Effect.runSync(Effect.result(defineTaskEffect(options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Checks a task descriptor candidate in Effect.
 * @param value - Untrusted candidate.
 * @returns True for a valid task descriptor; no expected failure.
 * @example Effect.runSync(isTaskDescriptorEffect(value));
 */
export const isTaskDescriptorEffect = Effect.fn("Jobs.isTaskDescriptor")((value: unknown) =>
  observeJobs(
    "task.isDescriptor",
    Effect.sync(() => isTaskDescriptorValue(value)),
  ),
);
/** Synchronous task descriptor type guard.
 * @param value - Untrusted candidate.
 * @returns True for a valid task descriptor.
 * @example if (isTaskDescriptor(value)) console.log(value.id);
 */
export function isTaskDescriptor(value: unknown): value is TaskDescriptorAny {
  return Effect.runSync(isTaskDescriptorEffect(value));
}
/** Asserts a task descriptor in Effect.
 * @param value - Untrusted candidate.
 * @returns Void or TaskDefinitionFailure.
 * @example Effect.runSync(assertTaskDescriptorEffect(task));
 */
export const assertTaskDescriptorEffect = Effect.fn("Jobs.assertTaskDescriptor")((value: unknown) =>
  observeJobs(
    "task.assertDescriptor",
    Effect.gen(function* () {
      if (yield* isTaskDescriptorEffect(value)) return;
      return yield* new TaskDefinitionFailure({
        cause: new TypeError("Job task must be a task descriptor"),
      });
    }),
  ),
);
/** Synchronous task descriptor assertion.
 * @param value - Untrusted candidate.
 * @returns Nothing when valid.
 * @throws TypeError for invalid descriptors.
 * @example assertTaskDescriptor(task);
 */
export function assertTaskDescriptor(value: unknown): asserts value is TaskDescriptorAny {
  const result = Effect.runSync(Effect.result(assertTaskDescriptorEffect(value)));
  if (Result.isFailure(result)) throw result.failure.cause;
}
