import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
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
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";
import type { DurationInput } from "./duration.js";
import type { JobTriggerClients, TaskClients } from "./task-client.types.js";
import type { TaskAuthContext, TaskSleepOptions } from "./task-context-policy.types.js";

export type {
  JobDescriptorForThisTask,
  RunResultOptions,
  ServerTriggerOptions,
  TaskTriggerOptions,
  TriggerOptions,
} from "./trigger.types.js";

export type { DurationInput } from "./duration.js";
export type {
  TaskAuthContext,
  TaskRetryPolicy,
  NormalizedTaskRetryPolicy,
  TaskResources,
  TaskConcurrency,
  TaskSleepOptions,
} from "./task-context-policy.types.js";
export type {
  TaskProgressEmitter,
  TaskStreamEmitter,
  TaskStreamItem,
  TaskProgressInput,
  TaskProgressOutput,
  TaskStreamInput,
  TaskStreamOutput,
  TaskStreamEmitters,
  TaskStreamFrames,
} from "./task-emission.types.js";
import type { TaskProgressEmitter, TaskStreamEmitters } from "./task-emission.types.js";
export type {
  InputOf,
  JobTriggerClients,
  OutputOf,
  TaskClientFor,
  TaskClients,
} from "./task-client.types.js";

/** Whether a task uses durable or retryable execution. */
export type TaskExecution = "durable" | "retryable";
/** Human-readable MiB or GiB memory quantity for task resources. */
export type MemoryInput = `${number} MiB` | `${number} GiB`;
/** Event names registered for the application. */
export type PublishedEventName = Extract<keyof Relkit.EventRegistry, string>;

type PublishedEventMap<Names extends readonly string[]> = {
  readonly [Name in Extract<Names[number], PublishedEventName>]: Relkit.EventRegistry[Name];
};

type RegisteredContext<
  Key extends PropertyKey,
  Fallback,
> = Key extends keyof Relkit.ApplicationContextRegistry
  ? Relkit.ApplicationContextRegistry[Key]
  : Fallback;

/** Resources a task explicitly declares before it can be executed. */
export interface TaskDependencies {
  readonly tasks?: Readonly<Record<string, TaskRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
}

/** Stable run identity and attempt metadata available to a task. */
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
  readonly acceptanceIdentity?: string;
}

/** Common invocation context shared by task handlers and hooks. */
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

/** Named item schemas used to validate task stream emissions. */
export type TaskStreamSchemas = Readonly<Record<string, StandardSchemaV1>>;

/** Execution context assembled from the task's declared dependencies and capabilities. */
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

/** Invocation context visible to task lifecycle hooks. */
export type TaskHookContext<
  Dependencies extends TaskDependencies = {},
  Publishes extends readonly string[] = readonly [],
> = TaskContextBase<Dependencies, Publishes>;
