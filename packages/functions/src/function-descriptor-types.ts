import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  InvocationMetadata as SharedInvocationMetadata,
  InvocationSource as SharedInvocationSource,
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
} from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionToolMetadata } from "./function-tool.js";
import type { FunctionAsTool } from "./function-as-tool-types.js";
import type { FunctionHandlerResult } from "./handler-result.js";
import type {
  AgentClients,
  BucketClients,
  CacheClients,
  EventClients,
  JobClients,
} from "./clients.js";
import type {
  AgentRefAny,
  BucketRefAny,
  CacheRefAny,
  EventRefAny,
  FunctionRef,
  JobRefAny,
} from "./types.js";

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

export type PublicLogger = SharedPublicLogger;
export type PublicClock = SharedPublicClock;

declare global {
  namespace Relkit {
    interface ApplicationContextRegistry {}
  }
}

export type ApplicationContextRegistry = Relkit.ApplicationContextRegistry;

type RegisteredContext<
  Key extends PropertyKey,
  Fallback,
> = Key extends keyof Relkit.ApplicationContextRegistry
  ? Relkit.ApplicationContextRegistry[Key]
  : Fallback;

export interface AuthContext<Session = unknown> {
  readonly getSession: () => Promise<Session | null>;
}

type FunctionDependencyOptions<D extends FunctionDependencies> = "functions" extends keyof D
  ? never
  : D;

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
  readonly database: RegisteredContext<"database", Readonly<Record<string, never>>>;
  readonly auth: RegisteredContext<"auth", AuthContext>;
  readonly constants: RegisteredContext<"constants", Readonly<Record<string, never>>>;
  readonly prompts: RegisteredContext<"prompts", Readonly<Record<string, never>>>;
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
  readonly onBefore?: FunctionLifecycleHook<Input, Dependencies>;
  readonly onAfter?: FunctionLifecycleHook<Output, Dependencies>;
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
  readonly onBefore?: FunctionLifecycleHook<InferOutput<InputSchema>, Dependencies>;
  readonly onAfter?: FunctionLifecycleHook<InferOutput<OutputSchema>, Dependencies>;
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
  context: FunctionContext<Dependencies>,
) => MaybePromise<FunctionHandlerResult<Output, Errors>>;

export type FunctionLifecycleHook<Value, Dependencies extends FunctionDependencies = {}> = (
  value: Value,
  context: FunctionContext<Dependencies>,
) => MaybePromise<Value>;
