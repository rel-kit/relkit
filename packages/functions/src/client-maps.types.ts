import type { BucketClient } from "@relkit/buckets";
import type { CacheClient } from "@relkit/cache";
import type { RunHandle } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type {
  EventPublishOptions,
  EventPublishResult,
  JobEnqueueOptions,
  JobEnqueueResult,
} from "./clients.types.js";

type InputOf<T> = T extends { readonly input: infer S }
  ? S extends StandardSchemaV1
    ? InferInput<S>
    : never
  : never;
type OutputOf<T> = T extends { readonly output: infer S }
  ? S extends StandardSchemaV1
    ? InferOutput<S>
    : never
  : never;
type EventInputOf<T> = T extends { readonly input: infer S }
  ? S extends StandardSchemaV1
    ? InferInput<S>
    : never
  : never;
type EventOutputOf<T> = T extends { readonly input: infer S }
  ? S extends StandardSchemaV1
    ? InferOutput<S>
    : never
  : never;
type EventIdOf<T> = T extends { readonly ref: { readonly id: infer Id } }
  ? Id extends string
    ? Id
    : string
  : string;
type EventVersionOf<T> = T extends { readonly version: infer Version }
  ? Version extends number
    ? Version
    : number
  : number;
type KeyOf<T> = T extends { readonly key: infer S }
  ? S extends StandardSchemaV1
    ? InferInput<S>
    : never
  : never;
type ValueOf<T> = T extends { readonly value: infer S }
  ? S extends StandardSchemaV1
    ? InferOutput<S>
    : never
  : never;

/** Typed callable client for an agent descriptor.
 * @param input - Agent input inferred from its schema.
 * @returns Output inferred from the agent schema.
 * @example const invoke: AgentClientFor<typeof agent> = async (input) => output;
 */
export type AgentClientFor<T> = (input: InputOf<T>) => Promise<OutputOf<T>>;
/** Typed enqueue client for a job descriptor.
 * @example const client: JobClientFor<typeof job> = jobs.myJob;
 */
export type JobClientFor<T> = {
  /** Enqueues a job invocation.
   * @param input - Job input.
   * @param options - Optional correlation metadata.
   * @returns Acceptance receipt.
   * @example await jobs.send.enqueue(input);
   */
  enqueue(input: InputOf<T>, options?: JobEnqueueOptions): Promise<JobEnqueueResult>;
};
/** Scheduling and idempotency options for a task.
 * @example await tasks.send.trigger(input, { operationId: "send-1" });
 */
export interface TaskTriggerOptions {
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly delay?: string;
  readonly at?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
}
/** Typed trigger client for a task descriptor.
 * @example const client: TaskClientFor<typeof task> = tasks.send;
 */
export type TaskClientFor<T> = {
  /** Triggers a task run.
   * @param input - Task input.
   * @param options - Optional scheduling and idempotency controls.
   * @returns Handle for the new run.
   * @example await tasks.send.trigger(input);
   */
  trigger(input: InputOf<T>, options?: TaskTriggerOptions): Promise<RunHandle>;
};
/** Typed publish client for an event descriptor.
 * @example const client: EventClientFor<typeof event> = events.created;
 */
export type EventClientFor<T> = {
  /** Publishes an event.
   * @param payload - Event payload.
   * @param options - Optional key and attributes.
   * @returns Accepted event envelope.
   * @example await events.created.publish(payload);
   */
  publish(
    payload: EventInputOf<T>,
    options?: EventPublishOptions,
  ): Promise<EventPublishResult<EventIdOf<T>, EventVersionOf<T>, EventOutputOf<T>>>;
};
/** Bucket client exposed for a declared bucket.
 * @example const client: BucketClientFor<typeof bucket> = buckets.uploads;
 */
export type BucketClientFor<T> = BucketClient;
/** Key and value typed cache client.
 * @example const client: CacheClientFor<typeof cache> = caches.sessions;
 */
export type CacheClientFor<T> = CacheClient<KeyOf<T>, ValueOf<T>>;

/** Named job clients projected from dependencies.
 * @example const jobs: JobClients<typeof dependencies.jobs> = context.jobs;
 */
export type JobClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: JobClientFor<NonNullable<M>[Name]>;
};
/** Named task clients projected from dependencies.
 * @example const tasks: TaskClients<typeof dependencies.tasks> = context.tasks;
 */
export type TaskClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: TaskClientFor<NonNullable<M>[Name]>;
};
/** Named event clients projected from published events.
 * @example const events: EventClients<typeof published> = context.events;
 */
export type EventClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: EventClientFor<NonNullable<M>[Name]>;
};
/** Named bucket clients projected from dependencies.
 * @example const buckets: BucketClients<typeof dependencies.buckets> = context.buckets;
 */
export type BucketClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: BucketClientFor<NonNullable<M>[Name]>;
};
/** Named cache clients projected from dependencies.
 * @example const cache: CacheClients<typeof dependencies.cache> = context.cache;
 */
export type CacheClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: CacheClientFor<NonNullable<M>[Name]>;
};
/** Named agent clients projected from dependencies.
 * @example const agents: AgentClients<typeof dependencies.agents> = context.agents;
 */
export type AgentClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: AgentClientFor<NonNullable<M>[Name]>;
};
