import type { MaybePromise } from "@relkit/contracts";
import type { DeclaredErrorsOf, ErrorDescriptorAny, FunctionFailure } from "@relkit/functions";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type {
  TaskContext,
  TaskDependencies,
  TaskExecution,
  TaskHookContext,
  TaskStreamSchemas,
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

export type TaskHandlerResult<Output, Errors extends readonly ErrorDescriptorAny[]> =
  Output | DeclaredErrorsOf<Errors> | FunctionFailure<DeclaredErrorsOf<Errors>>;

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
> = (error: unknown, context: TaskHookContext<Dependencies, Publishes>) => Promise<void>;

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
