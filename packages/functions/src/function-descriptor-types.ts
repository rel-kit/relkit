import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  InvocationMetadata as SharedInvocationMetadata,
  InvocationSource as SharedInvocationSource,
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
  PublicTrace as SharedPublicTrace,
} from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionToolMetadata } from "./function-tool.js";
import type { FunctionAsTool } from "./function-as-tool-types.js";
import type { FunctionAsGraphNode } from "./function-graph-node.js";
import type { FunctionHandlerResult } from "./handler-result.js";
import type { StreamOutputSchema } from "./stream.js";
import type { AgentClients, BucketClients, CacheClients, JobClients } from "./clients.js";
import type { AgentRefAny, BucketRefAny, CacheRefAny, FunctionRef, JobRefAny } from "./types.js";

export interface FunctionDependencies {
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}

export type InvocationSource = SharedInvocationSource;
export type InvocationMetadata = SharedInvocationMetadata;
export type ResolvedApplicationEnv = keyof Relkit.ApplicationEnv extends never
  ? Readonly<Record<string, unknown>>
  : Readonly<Relkit.ApplicationEnv>;

export type PublicLogger = SharedPublicLogger;
export type PublicClock = SharedPublicClock;
export type PublicTrace = SharedPublicTrace;

declare global {
  namespace Relkit {
    interface ApplicationEnv {}
    interface ApplicationContextRegistry {}
    interface EventRegistry {}
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

type KnownEventName = Extract<keyof Relkit.EventRegistry, string>;
type PublishedEventMap<Names extends readonly KnownEventName[]> = {
  readonly [Name in Names[number]]: Relkit.EventRegistry[Name];
};

export interface FunctionContextBase<
  D extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
> {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly trace: PublicTrace;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: import("./clients.js").EventClients<PublishedEventMap<Publishes>>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
  readonly database: RegisteredContext<"database", Readonly<Record<string, never>>>;
  readonly auth: RegisteredContext<"auth", AuthContext>;
  readonly constants: RegisteredContext<"constants", Readonly<Record<string, never>>>;
  readonly prompts: RegisteredContext<"prompts", Readonly<Record<string, never>>>;
}

export type FunctionContext<
  D extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
  Progress = never,
> = FunctionContextBase<D, Publishes> &
  ([Progress] extends [never]
    ? {}
    : { readonly progress: import("@relkit/invocation").ProgressEmitter<Progress> });

export interface FunctionDescriptor<
  Id extends string,
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined = undefined,
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
>
  extends
    DescriptorBase<"function", Id>,
    FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema> {
  readonly dependencies?: FunctionDependencyOptions<Dependencies>;
  readonly invocationMode: "callable";
  readonly publishes?: Publishes;
  readonly progress?: ProgressSchema;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: ToolMetadata;
  readonly onBefore?: FunctionLifecycleHook<Input, Dependencies, Publishes, ProgressSchema>;
  readonly onAfter?: FunctionLifecycleHook<Output, Dependencies, Publishes, ProgressSchema>;
  readonly handler: FunctionHandler<Input, Output, Dependencies, Errors, Publishes, ProgressSchema>;
  readonly invoke: (input: InferInput<InputSchema>) => Promise<Output>;
  readonly asTool: OutputSchema extends StreamOutputSchema
    ? never
    : FunctionAsTool<Id, Input, Output, Errors, InputSchema, OutputSchema, ToolMetadata>;
  readonly asGraphNode: OutputSchema extends StreamOutputSchema
    ? never
    : FunctionAsGraphNode<Id, Input, Output, Errors, InputSchema, OutputSchema, Dependencies>;
}

export interface DefineFunctionOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  readonly publishes?: Publishes;
  readonly progress?: ProgressSchema;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: FunctionToolMetadata;
  readonly onBefore?: FunctionLifecycleHook<
    InferOutput<InputSchema>,
    Dependencies,
    Publishes,
    ProgressSchema
  >;
  readonly onAfter?: FunctionLifecycleHook<
    InferOutput<OutputSchema>,
    Dependencies,
    Publishes,
    ProgressSchema
  >;
  readonly handler: FunctionHandler<
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    Errors,
    Publishes,
    ProgressSchema
  >;
}

export type FunctionHandler<
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  input: Input,
  context: FunctionContext<Dependencies, Publishes, ProgressValue<ProgressSchema>>,
) => MaybePromise<FunctionHandlerResult<Output, Errors>>;

export type FunctionLifecycleHook<
  Value,
  Dependencies extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  value: Value,
  context: FunctionContext<Dependencies, Publishes, ProgressValue<ProgressSchema>>,
) => MaybePromise<Value>;

type ProgressValue<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? InferOutput<Schema>
  : never;
