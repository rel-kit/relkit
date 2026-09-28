import type { MaybePromise } from "@relkit/contracts";
import type { DeclaredErrorsOf, ErrorDescriptorAny, FunctionFailure } from "@relkit/functions";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type {
  TaskContext,
  TaskDependencies,
  TaskExecution,
  TaskHookContext,
  TaskStreamSchemas,
} from "./task-core.types.js";

/** Handler receives validated input and scoped context, then returns output or a declared failure. */
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

/** Allowed output and declared failure forms returned by a task handler. */
export type TaskHandlerResult<Output, Errors extends readonly ErrorDescriptorAny[]> =
  Output | DeclaredErrorsOf<Errors> | FunctionFailure<DeclaredErrorsOf<Errors>>;

/** Hook invoked before task execution begins. */
export type TaskStartHook<
  InputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (
  input: InferOutput<InputSchema>,
  context: TaskHookContext<Dependencies, Publishes>,
) => Promise<void>;

/** Hook invoked after a task completes successfully. */
export type TaskSuccessHook<
  OutputSchema extends StandardSchemaV1,
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (
  output: InferOutput<OutputSchema>,
  context: TaskHookContext<Dependencies, Publishes>,
) => Promise<void>;

/** Hook invoked after task execution fails. */
export type TaskFailureHook<
  Dependencies extends TaskDependencies,
  Publishes extends readonly string[] = readonly [],
> = (error: unknown, context: TaskHookContext<Dependencies, Publishes>) => Promise<void>;

/** Visibility settings for progress and named streams. */
export interface TaskObservation<
  Streams extends TaskStreamSchemas = TaskStreamSchemas,
  ProgressSchema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  readonly progress?: [ProgressSchema] extends [undefined] ? never : "live" | "durable";
  readonly streams?: Readonly<{ [Name in keyof Streams & string]?: "live" | "history" }>;
}

/** Log level and fields to redact during task execution. */
export interface TaskLogging {
  readonly level?: "trace" | "debug" | "info" | "warn" | "error";
  readonly redact?: readonly string[];
}
