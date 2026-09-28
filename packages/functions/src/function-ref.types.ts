import type { DescriptorKind, Ref } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";

/** Stable reference carried by a descriptor.
 * @example const ref: DescriptorRef<"function"> = { ref: { kind: "function", id: "orders.get" } };
 */
export interface DescriptorRef<Kind extends DescriptorKind, Id extends string = string> {
  readonly ref: Ref<Kind, Id>;
}

/** Schema and identity view of a callable function.
 * @example const ref: FunctionRef = descriptor;
 */
export interface FunctionRef<
  Id extends string = string,
  Input = unknown,
  Output = unknown,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"function", Id> {
  readonly invocationMode?: "callable";
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly __input?: Input;
  readonly __output?: Output;
}

/** Schema and version view of a declared event.
 * @example const ref: EventRef = event;
 */
export interface EventRef<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"event", Id> {
  readonly version: number;
  readonly input: InputSchema;
}

/** Stable reference to a bucket.
 * @example const ref: BucketRef = bucket;
 */
export type BucketRef<Id extends string = string> = DescriptorRef<"bucket", Id>;

/** Key and value schemas for a cache reference.
 * @example const ref: CacheRef = cache;
 */
export interface CacheRef<
  Id extends string = string,
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"cache", Id> {
  readonly key: KeySchema;
  readonly value: ValueSchema;
}

/** Input and output schemas for an agent reference.
 * @example const ref: AgentRef = agent;
 */
export interface AgentRef<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorRef<"agent", Id> {
  readonly input: InputSchema;
  readonly output: OutputSchema;
}

/** Broad function reference for heterogeneous collections.
 * @example const ref: FunctionRefAny = descriptor;
 */
export type FunctionRefAny = FunctionRef;
/** Broad event reference for heterogeneous collections.
 * @example const ref: EventRefAny = event;
 */
export type EventRefAny = EventRef;
/** Broad bucket reference for heterogeneous collections.
 * @example const ref: BucketRefAny = bucket;
 */
export type BucketRefAny = BucketRef;
/** Broad cache reference for heterogeneous collections.
 * @example const ref: CacheRefAny = cache;
 */
export type CacheRefAny = CacheRef;
/** Broad agent reference for heterogeneous collections.
 * @example const ref: AgentRefAny = agent;
 */
export type AgentRefAny = AgentRef;
