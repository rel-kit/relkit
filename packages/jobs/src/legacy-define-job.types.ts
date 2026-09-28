import type { DescriptorBase, DescriptorMetadata, JsonValue } from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";
/** Jitter strategy retained for legacy job retry policy. */
export type RetryJitter = "none" | "full" | "equal";
/** Legacy retry attempts, backoff, and jitter settings. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RetryJitter;
}
/** Legacy policy for simultaneous schedule occurrences. */
export type ScheduleOverlap = "skip" | "allow";
/** Legacy schedule timing and overlap configuration. */
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
/** Legacy deduplication key and retention policy. */
export interface IdempotencyDefinition<Input = unknown> {
  readonly key: IdempotencyKey<Input>;
  readonly retentionMs: number;
}
/** Validated job definition and its task-specific trigger operation. */
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
/** Options accepted for define job operations. */
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
