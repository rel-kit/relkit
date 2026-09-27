import {
  assertJsonValue,
  createDescriptorBase,
  deepFreeze,
  isRef,
  normalizeId,
  type JsonValue,
} from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type {
  DefineJobOptions,
  JobDescriptor,
  ScheduleDefinition,
  IdempotencyDefinition,
} from "./legacy-define-job.types.js";
export type {
  RetryJitter,
  RetryPolicy,
  ScheduleOverlap,
  ScheduleDefinition,
  IdempotencyDefinition,
  JobDescriptor,
  DefineJobOptions,
} from "./legacy-define-job.types.js";
import { type InferInput, type StandardSchemaV1 } from "@relkit/schema";
import { validateRetry } from "./retry-policy.js";
/** Invalid legacy job authoring options.
 * @example if (error instanceof LegacyJobValidationError) console.log(error.message);
 */
export class LegacyJobValidationError extends Schema.TaggedError<LegacyJobValidationError>()(
  "Jobs.LegacyJobValidationError",
  { reason: Schema.String },
) {}
/** Defines a legacy function backed job in Effect.
 * @param options - Job identity, input schema, target, and policy.
 * @returns A frozen descriptor or LegacyJobValidationError.
 * @example Effect.runSync(defineJobEffect(options));
 */
export const defineJobEffect = Effect.fn("Jobs.defineLegacyJob")(
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const Target extends FunctionRefAny,
  >(
    options: DefineJobOptions<Id, InputSchema, Target>,
  ) =>
    observeJobs(
      "legacy.defineJob",
      Effect.try({
        try: () => defineJobValue(options),
        catch: (error) => {
          if (error instanceof Error)
            return new LegacyJobValidationError({ reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronous compatibility adapter for legacy job authoring.
 * @param options - Job identity, input schema, target, and policy.
 * @returns A frozen descriptor.
 * @throws TypeError when the authored job is invalid.
 * @example defineJob(options);
 */
export function defineJob<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const Target extends FunctionRefAny,
>(
  options: DefineJobOptions<Id, InputSchema, Target>,
): JobDescriptor<Id, InferInput<InputSchema>, InputSchema, Target> {
  const result = Effect.runSync(Effect.result(defineJobEffect(options)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
function defineJobValue<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const Target extends FunctionRefAny,
>(
  options: DefineJobOptions<Id, InputSchema, Target>,
): JobDescriptor<Id, InferInput<InputSchema>, InputSchema, Target> {
  if (!isRecord(options)) throw new TypeError("Job options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Jobs cannot own handlers");
  if (!isSchema(options.input))
    throw new TypeError("Job input must be a Standard Schema v1 validator");
  if (!isFunctionTarget(options.target))
    throw new TypeError("Job target must be a function reference");
  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const retry = validateRetry(options.retry);
  if (options.timeoutMs !== undefined) positiveInteger(options.timeoutMs, "timeoutMs");
  if (options.concurrency !== undefined) positiveInteger(options.concurrency, "concurrency");
  const schedule = copySchedules(options.schedule);
  const idempotency = copyIdempotency(options.idempotency);
  const base = createDescriptorBase("job", options.id, options);
  return deepFreeze({
    ...base,
    input: options.input,
    target: options.target,
    ...(profile === undefined ? {} : { profile }),
    retry,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(schedule === undefined ? {} : { schedule }),
    ...(idempotency === undefined ? {} : { idempotency }),
  }) as JobDescriptor<Id, InferInput<InputSchema>, InputSchema, Target>;
}
function copySchedules<Input>(
  value: readonly ScheduleDefinition<Input>[] | undefined,
): readonly ScheduleDefinition<Input>[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Job schedules must be an array");
  const ids = new Set<string>();
  const schedules = value.map((entry) => {
    if (!isRecord(entry)) throw new TypeError("Job schedule must be an object");
    const id = normalizeId(entry.id);
    if (ids.has(id)) throw new TypeError(`Duplicate job schedule "${id}"`);
    ids.add(id);
    const cron = requiredText(entry.cron, "schedule.cron");
    const timezone = requiredText(entry.timezone, "schedule.timezone");
    if (!hasOwn(entry, "input")) throw new TypeError("schedule.input is required");
    assertJsonValue(entry.input as unknown);
    if (entry.overlap !== "skip" && entry.overlap !== "allow") {
      throw new TypeError("schedule.overlap must be skip or allow");
    }
    return Object.freeze({ id, cron, timezone, input: entry.input, overlap: entry.overlap });
  });
  return Object.freeze(schedules);
}
function copyIdempotency<Input>(
  value: IdempotencyDefinition<Input> | undefined,
): IdempotencyDefinition<Input> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Job idempotency must be an object");
  return Object.freeze({
    key: requiredText(value.key, "idempotency.key"),
    retentionMs: positiveInteger(value.retentionMs, "idempotency.retentionMs"),
  }) as IdempotencyDefinition<Input>;
}
function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${name} must be a positive integer`);
  return value as number;
}
function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}
function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    value.invocationMode !== "event-only" &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output)
  );
}
function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
