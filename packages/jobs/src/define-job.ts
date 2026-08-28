import {
  assertJsonValue,
  createDescriptorBase,
  deepFreeze,
  isRef,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
  type JsonValue,
} from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import { type InferInput, type StandardSchemaV1 } from "@relkit/schema";
import { validateRetry } from "./retry-policy.js";

export type RetryJitter = "none" | "full" | "equal";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RetryJitter;
}

export type ScheduleOverlap = "skip" | "allow";

export interface ScheduleDefinition<Input = JsonValue> {
  readonly id: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: Input;
  readonly overlap: ScheduleOverlap;
}

type IdempotencyKey<Input> = [Extract<keyof Input, string>] extends [never]
  ? string
  : Extract<keyof Input, string>;

export interface IdempotencyDefinition<Input = unknown> {
  readonly key: IdempotencyKey<Input>;
  readonly retentionMs: number;
}

export interface JobDescriptor<
  Id extends string,
  Input,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  Target extends FunctionRefAny = FunctionRefAny,
> extends DescriptorBase<"job", Id> {
  readonly input: InputSchema;
  readonly target: Target;
  readonly profile?: string;
  readonly retry: RetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly schedule?: readonly ScheduleDefinition<Input>[];
  readonly idempotency?: IdempotencyDefinition<Input>;
}

export interface DefineJobOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  Target extends FunctionRefAny,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly input: InputSchema;
  readonly target: Target;
  readonly profile?: string;
  readonly retry: RetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly schedule?: readonly ScheduleDefinition<InferInput<InputSchema>>[];
  readonly idempotency?: IdempotencyDefinition<InferInput<InputSchema>>;
}

/**
 * Defines a durable job trigger with validated input, retry, timeout, and idempotency policy.
 * A retryable declared error may add an `afterMs` minimum delay; the provider
 * combines it with this job policy and direct function calls do not auto-retry.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/app/functions"
 * import { defineJob } from "@relkit/app/jobs"
 * import { z } from "@relkit/app/schema"
 *
 * const target = defineFunction({ id: "email", input: z.string(), output: z.void(), handler: async () => undefined })
 * const job = defineJob({ id: "email", input: z.string(), target, retry: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1_000, multiplier: 2, jitter: "full" } })
 * void job
 * ```
 * @category Jobs
 * @since 0.1.0
 */
export function defineJob<
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
    if (entry.overlap !== "skip" && entry.overlap !== "allow")
      throw new TypeError("schedule.overlap must be skip or allow");
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
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output)
  );
}
function isSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
