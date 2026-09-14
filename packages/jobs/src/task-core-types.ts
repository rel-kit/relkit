import type {
  JobRefAny,
  NamedStreamFrame,
  ProgressEmitReceipt,
  RunHandle,
  TaskRefAny,
} from "@relkit/contracts/jobs";
import type {
  AgentClients,
  AgentRefAny,
  BucketClients,
  BucketRefAny,
  CacheClients,
  CacheRefAny,
  EventClients,
  ResolvedApplicationEnv,
} from "@relkit/functions";
import type {
  InvocationMetadata,
  PublicClock,
  PublicLogger,
  PublicTrace,
} from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { DurationInput } from "./duration.js";
import type { ServerTriggerOptions } from "./trigger-types.js";

export type {
  JobDescriptorForThisTask,
  RunResultOptions,
  ServerTriggerOptions,
  TaskTriggerOptions,
  TriggerOptions,
} from "./trigger-types.js";

export type { DurationInput } from "./duration.js";

export type TaskExecution = "durable" | "retryable";
export type MemoryInput = `${number} MiB` | `${number} GiB`;
export type PublishedEventName = Extract<keyof Relkit.EventRegistry, string>;

type PublishedEventMap<Names extends readonly string[]> = {
  readonly [Name in Extract<Names[number], PublishedEventName>]: Relkit.EventRegistry[Name];
};

type RegisteredContext<Key extends PropertyKey, Fallback> = Key extends keyof Relkit.ApplicationContextRegistry
  ? Relkit.ApplicationContextRegistry[Key]
  : Fallback;

export interface TaskAuthContext<Session = unknown> {
  readonly getSession: () => Promise<Session | null>;
}

export interface TaskRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelay?: DurationInput;
  readonly maxDelay?: DurationInput;
  readonly factor?: number;
  readonly jitter?: "none" | "full";
}

export interface NormalizedTaskRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelay: DurationInput;
  readonly maxDelay: DurationInput;
  readonly factor: number;
  readonly jitter: "none" | "full";
}

export interface TaskResources {
  readonly cpu: number;
  readonly memory: MemoryInput;
}

export interface TaskConcurrency<InputKey extends string = string> {
  readonly limit: number;
  readonly key?: InputKey;
}

export interface TaskSleepOptions {
  readonly key: string;
}

export type InputOf<T> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;
export type OutputOf<T> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;

export type TaskClientFor<T> = {
  readonly trigger: (input: InputOf<T>, options?: ServerTriggerOptions) => Promise<RunHandle>;
};
export type TaskClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: TaskClientFor<NonNullable<M>[Name]>;
};
type TaskJobClientFor<T> = {
  readonly trigger: (input: InputOf<T>, options?: ServerTriggerOptions) => Promise<RunHandle>;
};
export type JobTriggerClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: TaskJobClientFor<NonNullable<M>[Name]>;
};

export interface TaskProgressEmitter<Value = unknown> {
  readonly emit: (value: Value) => Promise<ProgressEmitReceipt>;
}

export interface TaskStreamEmitter<Value = unknown> {
  readonly emit: (value: Value) => Promise<ProgressEmitReceipt>;
}

export type TaskStreamItem<Schema extends StandardSchemaV1> = InferOutput<Schema>;
export type TaskProgressInput<Schema extends StandardSchemaV1> = InferInput<Schema>;
export type TaskProgressOutput<Schema extends StandardSchemaV1> = InferOutput<Schema>;
export type TaskStreamInput<Schema extends StandardSchemaV1> = InferInput<Schema>;
export type TaskStreamOutput<Schema extends StandardSchemaV1> = InferOutput<Schema>;
export type TaskStreamEmitters<Streams extends TaskStreamSchemas> = {
  readonly [Name in keyof Streams & string]: TaskStreamEmitter<TaskStreamInput<Streams[Name]>>;
};
export type TaskStreamFrames<Streams extends TaskStreamSchemas> = {
  readonly [Name in keyof Streams & string]: NamedStreamFrame<TaskStreamOutput<Streams[Name]>> & {
    readonly name: Name;
  };
}[keyof Streams & string];

export interface TaskDependencies {
  readonly tasks?: Readonly<Record<string, TaskRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
}

export interface TaskRunContext {
  readonly runId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly service: string;
  readonly attempt: number;
  readonly acceptedAt: string;
  readonly scheduledFor?: string;
  readonly parentRunId?: string;
}

export interface TaskContextBase<
  Dependencies extends TaskDependencies = {},
  Publishes extends readonly string[] = readonly [],
> {
  readonly run: TaskRunContext;
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly trace: PublicTrace;
  readonly time: PublicClock;
  readonly tasks: TaskClients<Dependencies["tasks"]>;
  readonly jobs: JobTriggerClients<Dependencies["jobs"]>;
  readonly agents: AgentClients<Dependencies["agents"]>;
  readonly buckets: BucketClients<Dependencies["buckets"]>;
  readonly cache: CacheClients<Dependencies["cache"]>;
  readonly events: EventClients<PublishedEventMap<Publishes>>;
  readonly database: RegisteredContext<"database", Readonly<Record<string, never>>>;
  readonly auth: RegisteredContext<"auth", TaskAuthContext>;
  readonly constants: RegisteredContext<"constants", Readonly<Record<string, never>>>;
  readonly prompts: RegisteredContext<"prompts", Readonly<Record<string, never>>>;
  readonly idempotencyKey: (operation: string) => string;
}

export type TaskStreamSchemas = Readonly<Record<string, StandardSchemaV1>>;

export type TaskContext<
  Execution extends TaskExecution = TaskExecution,
  Dependencies extends TaskDependencies = {},
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
  Streams extends TaskStreamSchemas = {},
  Publishes extends readonly string[] = readonly [],
> = TaskContextBase<Dependencies, Publishes> &
  (Execution extends "durable"
    ? {
        readonly sleep: (duration: DurationInput, options: TaskSleepOptions) => Promise<void>;
        readonly sleepUntil: (instant: string, options: TaskSleepOptions) => Promise<void>;
      }
    : {}) &
  ([ProgressSchema] extends [StandardSchemaV1]
    ? { readonly progress: TaskProgressEmitter<InferInput<ProgressSchema>> }
    : {}) &
  ([keyof Streams] extends [never] ? {} : { readonly streams: TaskStreamEmitters<Streams> });

export type TaskHookContext<
  Dependencies extends TaskDependencies = {},
  Publishes extends readonly string[] = readonly [],
> = TaskContextBase<Dependencies, Publishes>;
