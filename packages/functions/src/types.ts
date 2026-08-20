import {
  type DescriptorBase,
  type DescriptorKind,
  type DescriptorMetadata,
  type FunctionRequest as ContractFunctionRequest,
  type MaybePromise,
  type Ref,
} from "@zsys/contracts";
import { type InferOutput, type StandardSchemaV1 } from "@zsys/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionHandlerResult } from "./handler-result.js";
import type {
  AgentClients,
  BucketClients,
  CacheClients,
  EventClients,
  FunctionClients,
  JobClients,
} from "./clients.js";

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
  FunctionClientFor,
  FunctionClients,
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

export interface FunctionDependencies {
  readonly functions?: Readonly<Record<string, FunctionRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly events?: Readonly<Record<string, EventRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}

export type InvocationSource = "direct" | "http" | "job" | "event" | "tool" | "agent";

export interface InvocationMetadata {
  readonly id: string;
  readonly parentId?: string;
  readonly traceId: string;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly attempt: number;
  readonly source: InvocationSource;
}

export type ResolvedApplicationEnv = Readonly<Record<string, unknown>>;

export type FunctionRequest = ContractFunctionRequest | undefined;

export interface PublicLogger {
  trace(message: string, fields?: Readonly<Record<string, unknown>>): void;
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface PublicClock {
  now(): Date;
  sleep(milliseconds: number): Promise<void>;
}

export interface FunctionContext<D extends FunctionDependencies = {}> {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly functions: FunctionClients<D["functions"]>;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: EventClients<D["events"]>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
}

export interface FunctionDescriptor<
  Id extends string,
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
>
  extends
    DescriptorBase<"function", Id>,
    FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema> {
  readonly dependencies?: Dependencies;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: FunctionHandler<Input, Output, Dependencies, Errors>;
}

export interface DefineFunctionOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
> extends DescriptorMetadata {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: FunctionHandler<
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    Errors
  >;
}

export type FunctionHandler<
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
> = (
  input: Input,
  request: FunctionRequest,
  context: FunctionContext<Dependencies>,
) => MaybePromise<FunctionHandlerResult<Output, Errors>>;
