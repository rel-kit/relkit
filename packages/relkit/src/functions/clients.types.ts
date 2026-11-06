import type { TracePropagation } from "../contracts/index.js";

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

export type { BucketClient, BucketObjectMetadata, BucketPutOptions } from "../buckets/index.js";
export type { CacheClient, CacheOperationOptions } from "../cache/index.js";

export type * from "./client-maps.types.js";
