import type { TracePropagation } from "@relkit/contracts";

/** Lifecycle state of a queued job.
 * @example const state: JobState = "accepted";
 */
export type JobState =
  "accepted" | "available" | "leased" | "delayed" | "completed" | "dead-lettered";

/** Snapshot of one queued job.
 * @example const status: JobStatus = await jobs.status(id);
 */
export interface JobStatus {
  readonly instanceId: string;
  readonly state: JobState;
  readonly profile: string;
  readonly attempt: number;
  readonly correlationId?: string;
}

/** Options for enqueuing a job.
 * @example await jobs.enqueue(input, { correlationId: "trace-1" });
 */
export interface JobEnqueueOptions {
  readonly correlationId?: string;
}

/** Receipt returned when a job is accepted.
 * @example const receipt: JobEnqueueResult = await jobs.enqueue(input);
 */
export interface JobEnqueueResult {
  readonly instanceId: string;
  readonly accepted: true;
  readonly duplicate?: boolean;
  readonly idempotencyKey?: string;
  readonly idempotencyExpiresAt?: number;
  readonly status: Extract<JobState, "accepted">;
  readonly profile: string;
  readonly correlationId?: string;
}

/** Scalar value accepted in event attributes.
 * @example const value: EventAttributeValue = true;
 */
export type EventAttributeValue = string | number | boolean;

interface EventEnvelope<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> {
  readonly instanceId: string;
  readonly eventId: Id;
  readonly version: Version;
  readonly payload: Payload;
  readonly occurredAt: string;
  readonly publishedAt: string;
  readonly key?: string;
  readonly propagation?: TracePropagation;
  readonly attributes: Readonly<Record<string, EventAttributeValue>>;
}

/** Metadata supplied with an event publication.
 * @example await events.publish(payload, { key: "order-1" });
 */
export interface EventPublishOptions {
  readonly key?: string;
  readonly attributes?: Readonly<Record<string, EventAttributeValue>>;
}

/** Accepted event envelope returned by publication.
 * @example const published: EventPublishResult = await events.publish(payload);
 */
export interface EventPublishResult<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends EventEnvelope<Id, Version, Payload> {
  readonly accepted: true;
}

export type { BucketClient, BucketObjectMetadata, BucketPutOptions } from "@relkit/buckets";
export type { CacheClient, CacheOperationOptions } from "@relkit/cache";

export type * from "./client-maps.types.js";
