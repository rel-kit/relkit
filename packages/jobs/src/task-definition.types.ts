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
} from "./task-core.types.js";
import type {
  TaskFailureHook,
  TaskHandler,
  TaskHandlerResult,
  TaskLogging,
  TaskObservation,
  TaskStartHook,
  TaskSuccessHook,
} from "./task-definition-support.types.js";
export type {
  TaskInput,
  TaskOutput,
  TaskCallerInput,
  TaskCanonicalInput,
  TaskRawHandlerOutput,
  TaskValidatedOutput,
} from "./task-definition-inference.types.js";

export type {
  TaskFailureHook,
  TaskHandler,
  TaskHandlerResult,
  TaskLogging,
  TaskObservation,
  TaskStartHook,
  TaskSuccessHook,
} from "./task-definition-support.types.js";

type ValidTaskDependencies<Dependencies extends TaskDependencies> =
  "functions" extends keyof Dependencies
    ? never
    : "events" extends keyof Dependencies
      ? never
      : Dependencies;

type CanonicalInputKey<Schema extends StandardSchemaV1> = string extends keyof InferOutput<Schema>
  ? string
  : Extract<keyof InferOutput<Schema>, string>;

/** Authoring contract for task schemas, dependencies, hooks, and execution policy. */
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

/** Validated task definition with an attached trigger operation. */
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
>
  extends DescriptorBase<"task", Id>, TaskRef<Id, InputSchema, OutputSchema, Errors> {
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

/** Task descriptor widened for registry and runtime boundaries. */
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
