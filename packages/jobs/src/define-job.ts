import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import { defineJobValue, isJobDescriptorValue } from "./define-job-value.js";
import type { DefineJobOptions, JobDescriptor, JobDescriptorAny } from "./job.types.js";
import type { TaskDescriptorAny } from "./task-types.js";
export { JOB_PROFILE_DEPRECATED_CODE } from "./define-job-value.js";
export type { RetryJitter, RetryPolicy } from "./job.types.js";
/** Expected job definition failure, retaining the original validation error.
 * @example if (error instanceof JobDefinitionFailure) console.log(error.message);
 */
export class JobDefinitionFailure extends Schema.TaggedError<JobDefinitionFailure>()(
  "Jobs.JobDefinitionFailure",
  { cause: Schema.Defect() },
) {}
/** Defines an immutable job descriptor in Effect.
 * @param options - Job identity, task, schedules, and client policy.
 * @returns A descriptor or JobDefinitionFailure.
 * @example Effect.runSync(defineJobEffect({ name: "sendReceipt", task }));
 */
export const defineJobEffect = Effect.fn("Jobs.defineJob")(
  <const Name extends string, const Task extends TaskDescriptorAny, const Id extends string = Name>(
    options: DefineJobOptions<Name, Task, Id>,
  ) =>
    observeJobs(
      "job.define",
      Effect.try({
        try: () => defineJobValue(options),
        catch: (cause) => new JobDefinitionFailure({ cause }),
      }),
    ),
);
/** Binds a task to an immutable job descriptor.
 * @param options - Job identity, task, schedules, and client policy.
 * @returns A frozen job descriptor.
 * @throws Original validation error for invalid definitions.
 * @example
 * ```ts
 * import { defineJob, defineTask } from "@relkit/jobs";
 * import { z } from "@relkit/schema";
 * const echo = defineTask({
 *   id: "echo", version: "1", input: z.string(), output: z.string(),
 *   execution: "retryable", handler: async (input) => input,
 * });
 * const echoJob = defineJob({ name: "echoJob", task: echo });
 * ```
 * @category Jobs
 * @since 0.4.1
 */
export function defineJob<
  const Name extends string,
  const Task extends TaskDescriptorAny,
  const Id extends string = Name,
>(options: DefineJobOptions<Name, Task, Id>): JobDescriptor<Name, Id, Task> {
  const result = Effect.runSync(Effect.result(defineJobEffect(options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Tests a value for a valid job descriptor in Effect.
 * @param value - Untrusted candidate.
 * @returns True if the candidate is a job descriptor; no expected failure.
 * @example Effect.runSync(isJobDescriptorEffect(value));
 */
export const isJobDescriptorEffect = Effect.fn("Jobs.isJobDescriptor")((value: unknown) =>
  observeJobs(
    "job.isDescriptor",
    Effect.sync(() => isJobDescriptorValue(value)),
  ),
);
/** Synchronous job descriptor type guard.
 * @param value - Untrusted candidate.
 * @returns True if the candidate is a job descriptor.
 * @example if (isJobDescriptor(value)) console.log(value.name);
 */
export function isJobDescriptor(value: unknown): value is JobDescriptorAny {
  return Effect.runSync(isJobDescriptorEffect(value));
}
/** Asserts a valid job descriptor in Effect.
 * @param value - Untrusted candidate.
 * @returns Void or JobDefinitionFailure.
 * @example Effect.runSync(assertJobDescriptorEffect(job));
 */
export const assertJobDescriptorEffect = Effect.fn("Jobs.assertJobDescriptor")((value: unknown) =>
  observeJobs(
    "job.assertDescriptor",
    Effect.gen(function* () {
      if (yield* isJobDescriptorEffect(value)) return;
      return yield* new JobDefinitionFailure({ cause: new TypeError("Invalid job descriptor") });
    }),
  ),
);
/** Synchronous job descriptor assertion.
 * @param value - Untrusted candidate.
 * @returns Nothing when valid.
 * @throws TypeError for an invalid descriptor.
 * @example assertJobDescriptor(job);
 */
export function assertJobDescriptor(value: unknown): asserts value is JobDescriptorAny {
  const result = Effect.runSync(Effect.result(assertJobDescriptorEffect(value)));
  if (Result.isFailure(result)) throw result.failure.cause;
}
