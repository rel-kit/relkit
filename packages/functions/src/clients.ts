import type { BucketClient } from "@relkit/buckets";
import type { CacheClient } from "@relkit/cache";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import type { TracePropagation } from "@relkit/contracts";

export type JobState =
  "accepted" | "available" | "leased" | "delayed" | "completed" | "dead-lettered";

export interface JobStatus {
  readonly instanceId: string;
  readonly state: JobState;
  readonly profile: string;
  readonly attempt: number;
  readonly correlationId?: string;
}

export interface JobEnqueueOptions {
  readonly correlationId?: string;
}

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

export interface EventPublishOptions {
  readonly key?: string;
  readonly attributes?: Readonly<Record<string, EventAttributeValue>>;
}

export interface EventPublishResult<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends EventEnvelope<Id, Version, Payload> {
  readonly accepted: true;
}

export type { BucketClient, BucketObjectMetadata, BucketPutOptions } from "@relkit/buckets";
export type { CacheClient, CacheOperationOptions } from "@relkit/cache";

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

export type AgentClientFor<T> = (input: InputOf<T>) => Promise<OutputOf<T>>;
export type JobClientFor<T> = {
  enqueue(input: InputOf<T>, options?: JobEnqueueOptions): Promise<JobEnqueueResult>;
};
export type EventClientFor<T> = {
  publish(
    payload: EventInputOf<T>,
    options?: EventPublishOptions,
  ): Promise<EventPublishResult<EventIdOf<T>, EventVersionOf<T>, EventOutputOf<T>>>;
};
export type BucketClientFor<T> = BucketClient;
export type CacheClientFor<T> = CacheClient<KeyOf<T>, ValueOf<T>>;

export type JobClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: JobClientFor<NonNullable<M>[Name]>;
};
export type EventClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: EventClientFor<NonNullable<M>[Name]>;
};
export type BucketClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: BucketClientFor<NonNullable<M>[Name]>;
};
export type CacheClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: CacheClientFor<NonNullable<M>[Name]>;
};
export type AgentClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: AgentClientFor<NonNullable<M>[Name]>;
};
