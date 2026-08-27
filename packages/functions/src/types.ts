import { type DescriptorKind, type Ref } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";

export type {
  AgentClientFor,
  AgentClients,
  BucketClient,
  BucketClientFor,
  BucketClients,
  BucketObjectMetadata,
  CacheClient,
  CacheClientFor,
  CacheClients,
  CacheOperationOptions,
  EventClientFor,
  EventClients,
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
  JobEnqueueOptions,
  JobClientFor,
  JobClients,
  JobEnqueueResult,
  JobState,
  JobStatus,
} from "./clients.js";

export interface DescriptorRef<Kind extends DescriptorKind, Id extends string = string> {
  readonly ref: Ref<Kind, Id>;
}

export interface FunctionRef<
  Id extends string = string,
  Input = unknown,
  Output = unknown,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"function", Id> {
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly __input?: Input;
  readonly __output?: Output;
}

export interface JobRef<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"job", Id> {
  readonly input: InputSchema;
  readonly profile?: string;
}

export interface EventRef<
  Id extends string = string,
  PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"event", Id> {
  readonly version: number;
  readonly payload: PayloadSchema;
}

export type BucketRef<Id extends string = string> = DescriptorRef<"bucket", Id>;

export interface CacheRef<
  Id extends string = string,
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"cache", Id> {
  readonly key: KeySchema;
  readonly value: ValueSchema;
}

export interface AgentRef<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"agent", Id> {
  readonly input: InputSchema;
  readonly output: OutputSchema;
}

export type FunctionRefAny = FunctionRef;
export type JobRefAny = JobRef;
export type EventRefAny = EventRef;
export type BucketRefAny = BucketRef;
export type CacheRefAny = CacheRef;
export type AgentRefAny = AgentRef;
export type * from "./function-descriptor-types.js";
