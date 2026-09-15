import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type { RunHandle, TaskRef } from "@relkit/contracts/jobs";
import type { DeclaredErrorsOf, ErrorDescriptorAny, FunctionFailure } from "@relkit/functions";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { DurationInput } from "./duration.js";
import type {
  NormalizedTaskRetryPolicy,
  TaskContext,
  TaskDependencies,
  TaskExecution,
  TaskHookContext,
  TaskSleepOptions,
  TaskStreamSchemas,
  TaskTriggerOptions,
  TaskResources,
  TaskConcurrency,
  TaskRetryPolicy,
  PublishedEventName,
} from "./task-core-types.js";

export type TaskHandler<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Execution extends TaskExecution,
  Dependencies extends TaskDependencies,
  Errors extends readonly ErrorDescriptorAny[],
  ProgressSchema extends StandardSchemaV1 | undefined,
  Streams extends TaskStreamSchemas,
  Publishes extends readonly string[],
> = (
  input: InferOutput<InputSchema>,
  context: TaskContext<Execution, Dependencies, ProgressSchema, Streams, Publishes>,
) => MaybePromise<TaskHandlerResult<InferInput<OutputSchema>, Errors>>;

export type TaskHandlerResult<
  Output,
  Errors extends readonly ErrorDescriptorAny[],
> = Output | DeclaredErrorsOf<Errors> | FunctionFailure<DeclaredErrorsOf<Errors>>;

export type TaskStartHook<
  InputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (
  input: InferOutput<InputSchema>,
  context: TaskHookContext<Dependencies, Publishes>,
) => Promise<void>;
export type TaskSuccessHook<
  OutputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (
  output: InferOutput<OutputSchema>,
  context: TaskHookContext<Dependencies, Publishes>,
) => Promise<void>;
export type TaskFailureHook<
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (
  error: unknown,
  context: TaskHookContext<Dependencies, Publishes>,
) => Promise<void>;

export interface TaskObservation<
  Streams extends TaskStreamSchemas = TaskStreamSchemas,
  ProgressSchema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  readonly progress?: [ProgressSchema] extends [undefined] ? never : "live" | "durable";
  readonly streams?: Readonly<{ [Name in keyof Streams & string]?: "live" | "history" }>;
}

export interface TaskLogging {
  readonly level?: "trace" | "debug" | "info" | "warn" | "error";
  readonly redact?: readonly string[];
}

type ValidTaskDependencies<Dependencies extends TaskDependencies> = "functions" extends keyof Dependencies
  ? never
  : "events" extends keyof Dependencies
    ? never
    : Dependencies;

type CanonicalInputKey<Schema extends StandardSchemaV1> = string extends keyof InferOutput<Schema>
  ? string
  : Extract<keyof InferOutput<Schema>, string>;

export interface DefineTaskOptions<
  Id extends string,
  Version extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
  Publishes extends readonly PublishedEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
  Streams extends TaskStreamSchemas = {},
  Execution extends TaskExecution = "durable",
> extends DescriptorMetadata {
  readonly id: Id;
  readonly version: Version;
  readonly input: InputSchema;
  readonly inputWire?: StandardSchemaV1<InferOutput<InputSchema>, InferOutput<InputSchema>>;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly execution?: Execution;
  readonly dependencies?: ValidTaskDependencies<Dependencies>;
  readonly publishes?: Publishes;
  readonly progress?: ProgressSchema;
  readonly streams?: Streams;
  readonly observation?: TaskObservation<Streams, ProgressSchema>;
  readonly retry?: TaskRetryPolicy;
  readonly resources?: TaskResources;
  readonly concurrency?: TaskConcurrency<CanonicalInputKey<InputSchema>>;
  readonly maxDuration?: DurationInput;
  readonly maxElapsed?: DurationInput;
  readonly logging?: TaskLogging;
  readonly onStart?: TaskStartHook<InputSchema, Dependencies, Publishes>;
  readonly onSuccess?: TaskSuccessHook<OutputSchema, Dependencies, Publishes>;
  readonly onFailure?: TaskFailureHook<Dependencies, Publishes>;
  readonly handler: TaskHandler<
    InputSchema,
    OutputSchema,
    Execution,
    Dependencies,
    Errors,
    ProgressSchema,
    Streams,
    Publishes
  >;
}

export interface TaskDescriptor<
  Id extends string,
  Version extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
  Publishes extends readonly string[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
  Streams extends TaskStreamSchemas = {},
  Execution extends TaskExecution = TaskExecution,
> extends DescriptorBase<"task", Id>,
    TaskRef<Id, InputSchema, OutputSchema, Errors> {
  readonly version: Version;
  readonly execution: Execution;
  readonly inputWire?: StandardSchemaV1<InferOutput<InputSchema>, InferOutput<InputSchema>>;
  readonly dependencies?: Dependencies;
  readonly publishes?: Publishes;
  readonly progress?: ProgressSchema;
  readonly streams?: Streams;
  readonly observation?: TaskObservation<Streams, ProgressSchema>;
  readonly retry: NormalizedTaskRetryPolicy;
  readonly resources?: TaskResources;
  readonly concurrency?: TaskConcurrency<CanonicalInputKey<InputSchema>>;
  readonly maxDuration?: DurationInput;
  readonly maxElapsed?: DurationInput;
  readonly logging?: TaskLogging;
  readonly onStart?: TaskStartHook<InputSchema, Dependencies, Publishes>;
  readonly onSuccess?: TaskSuccessHook<OutputSchema, Dependencies, Publishes>;
  readonly onFailure?: TaskFailureHook<Dependencies, Publishes>;
  readonly handler: TaskHandler<
    InputSchema,
    OutputSchema,
    Execution,
    Dependencies,
    Errors,
    ProgressSchema,
    Streams,
    Publishes
  >;
  readonly trigger: (
    input: InferInput<InputSchema>,
    options?: TaskTriggerOptions<TaskRef<Id, InputSchema, OutputSchema, Errors>>,
  ) => Promise<RunHandle>;
}

export type TaskDescriptorAny = DescriptorBase<"task", string> &
  TaskRef<string, StandardSchemaV1, StandardSchemaV1, readonly ErrorDescriptorAny[]> & {
    readonly version: string;
    readonly execution: TaskExecution;
    readonly inputWire?: StandardSchemaV1 | undefined;
    readonly dependencies?: TaskDependencies | undefined;
    readonly publishes?: readonly string[] | undefined;
    readonly progress?: StandardSchemaV1 | undefined;
    readonly streams?: TaskStreamSchemas | undefined;
    readonly observation?: TaskObservation | undefined;
    readonly retry: NormalizedTaskRetryPolicy;
    readonly resources?: TaskResources | undefined;
    readonly concurrency?: TaskConcurrency | undefined;
    readonly maxDuration?: DurationInput | undefined;
    readonly maxElapsed?: DurationInput | undefined;
    readonly logging?: TaskLogging | undefined;
    readonly onStart?: (...args: never[]) => Promise<void>;
    readonly onSuccess?: (...args: never[]) => Promise<void>;
    readonly onFailure?: (...args: never[]) => Promise<void>;
    readonly handler: (...args: never[]) => unknown;
    readonly trigger: (...args: never[]) => Promise<RunHandle>;
  };

export type TaskInput<T extends TaskRef> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;
export type TaskOutput<T extends TaskRef> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;

export type TaskCallerInput<T extends TaskRef> = TaskInput<T>;
export type TaskCanonicalInput<T extends TaskRef> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;
export type TaskRawHandlerOutput<T extends TaskRef> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;
export type TaskValidatedOutput<T extends TaskRef> = TaskOutput<T>;
