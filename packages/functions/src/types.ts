import {
  type DescriptorBase,
  type DescriptorKind,
  type DescriptorMetadata,
  type FunctionRequest as ContractFunctionRequest,
  type MaybePromise,
  type Ref,
} from "@zsys/contracts";
import type {
  InvocationMetadata as SharedInvocationMetadata,
  InvocationSource as SharedInvocationSource,
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
} from "@zsys/invocation";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@zsys/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type {
  FunctionToolDescriptor,
  FunctionToolMetadata,
  FunctionToolOptions,
} from "./function-tool.js";
import type { FunctionHandlerResult } from "./handler-result.js";
import type {
  AgentClients,
  BucketClients,
  CacheClients,
  EventClients,
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
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly events?: Readonly<Record<string, EventRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}

export type InvocationSource = SharedInvocationSource;

export type InvocationMetadata = SharedInvocationMetadata;

export type ResolvedApplicationEnv = Readonly<Record<string, unknown>>;

/** Optional immutable HTTP transport view; non-HTTP calls receive `undefined`. */
export type FunctionRequest = ContractFunctionRequest | undefined;

export type PublicLogger = SharedPublicLogger;

export type PublicClock = SharedPublicClock;

type FunctionDependencyOptions<D extends FunctionDependencies> = "functions" extends keyof D
  ? never
  : D;

type FunctionToolTarget<
  Id extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> = FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema>;

type FunctionToolView<
  ToolId extends string,
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> = FunctionToolDescriptor<
  ToolId,
  FunctionToolTarget<FunctionId, Input, Output, Errors, InputSchema, OutputSchema>
>;

type FunctionAsTool<
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined,
> = {
  <const ToolId extends string>(
    options: FunctionToolOptions<ToolId> & { readonly id: ToolId },
  ): FunctionToolView<ToolId, FunctionId, Input, Output, Errors, InputSchema, OutputSchema>;
  (
    options: FunctionToolOptions,
  ): FunctionToolView<
    `${FunctionId}.tool`,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema
  >;
} & ([ToolMetadata] extends [FunctionToolMetadata]
  ? {
      (): FunctionToolView<
        `${FunctionId}.tool`,
        FunctionId,
        Input,
        Output,
        Errors,
        InputSchema,
        OutputSchema
      >;
    }
  : {});

export interface FunctionContext<D extends FunctionDependencies = {}> {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: EventClients<D["events"]>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
  /** Read-only context added by the owning service middleware for this invocation. */
  readonly service: Readonly<Record<string, unknown>>;
}

export interface FunctionDescriptor<
  Id extends string,
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined = undefined,
>
  extends
    DescriptorBase<"function", Id>,
    FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema> {
  readonly dependencies?: FunctionDependencyOptions<Dependencies>;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: ToolMetadata;
  readonly handler: FunctionHandler<Input, Output, Dependencies, Errors>;
  /** Invokes the descriptor through the active or isolated common engine. */
  readonly invoke: (input: InferInput<InputSchema>) => Promise<Output>;
  /** Creates a handler-free tool view with inherited schemas and declared errors. */
  readonly asTool: FunctionAsTool<
    Id,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    ToolMetadata
  >;
}

export interface DefineFunctionOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: FunctionToolMetadata;
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
