import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  JobRef,
  RunHandle,
} from "@relkit/contracts/jobs";
import type { ErrorDescriptorAny } from "@relkit/functions";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { DurationInput } from "./duration.js";
import type { ValidJobName } from "./job-name.js";
import type {
  TaskDescriptorAny,
  TaskDependencies,
  TaskObservation,
  TaskStreamSchemas,
} from "./task-types.js";
import type { RunResultOptions, ServerTriggerOptions } from "./trigger-types.js";
import type {
  JobScheduleClient,
  ScheduleDefinition,
  ScheduleListOptions,
  ScheduleMisfire,
  ScheduleOverlap,
  ScheduleReadReceipt,
  ScheduleRecord,
  ScheduleWriteOptions,
  ScheduleWriteOutcome,
  ScheduleWriteReceipt,
} from "./schedule-types.js";

export type {
  JobScheduleClient,
  ScheduleDefinition,
  ScheduleListOptions,
  ScheduleMisfire,
  ScheduleOverlap,
  ScheduleReadReceipt,
  ScheduleRecord,
  ScheduleWriteOptions,
  ScheduleWriteOutcome,
  ScheduleWriteReceipt,
} from "./schedule-types.js";

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger-types.js";

export type RetryJitter = "none" | "full" | "equal";
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RetryJitter;
}

export interface JobAdmission<Input = unknown> {
  readonly pastAt?: "run" | "reject";
  readonly idempotency?: {
    readonly key?: Extract<keyof Input, string>;
    readonly retention?: DurationInput;
  };
}

export type JobClientField = "status" | "input" | "progress" | "output" | "error";
export interface JobAuthorizationContext {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
  readonly auth?: unknown;
  readonly run?: import("@relkit/contracts/jobs").RunSnapshot;
}
export type JobClientAccess<Streams extends TaskStreamSchemas = TaskStreamSchemas> =
  | {
      readonly public: true;
      readonly operations: readonly JobClientOperation[];
      readonly fields?: readonly JobClientField[];
      readonly streams?: readonly (keyof Streams & string)[];
    }
  | {
      readonly authorize: (
        request: JobAccessRequest,
        context: JobAuthorizationContext,
      ) => MaybePromise<JobAccessGrant>;
      readonly public?: never;
      readonly operations: readonly JobClientOperation[];
      readonly fields?: readonly JobClientField[];
      readonly streams?: readonly (keyof Streams & string)[];
    };

export type JobServiceSelection =
  | { readonly service?: string; readonly profile?: never }
  | { readonly service?: never; readonly profile?: string };

type StreamsOf<Task extends TaskDescriptorAny> = [NonNullable<Task["streams"]>] extends [never]
  ? {}
  : NonNullable<Task["streams"]> extends TaskStreamSchemas
    ? NonNullable<Task["streams"]>
    : {};

export type DefineJobOptions<
  Name extends string,
  Task extends TaskDescriptorAny,
  Id extends string = Name,
> = DescriptorMetadata &
  JobServiceSelection & {
    readonly name: Name & ValidJobName<Name>;
    readonly id?: Id;
    readonly task: Task;
    readonly default?: boolean;
    readonly schedules?: readonly ScheduleDefinition<InferInput<Task["input"]>>[];
    readonly admission?: JobAdmission<InferOutput<Task["input"]>>;
    readonly client?: JobClientAccess<StreamsOf<Task>>;
  };

export type JobDescriptor<
  Name extends string,
  Id extends string,
  Task extends TaskDescriptorAny,
> = DescriptorBase<"job", Id> &
  JobRef<Id, Task["input"], Task["output"], Task> & {
    readonly name: Name;
    readonly task: Task;
    readonly input: Task["input"];
    readonly output: Task["output"];
    readonly errors?: Task["errors"];
    readonly progress?: Task["progress"];
    readonly streams?: Task["streams"];
    readonly execution: Task["execution"];
    readonly observation?: TaskObservation<
      Task["streams"] extends TaskStreamSchemas ? Task["streams"] : {}
    >;
    readonly service?: string;
    readonly default?: boolean;
    readonly schedules?: readonly ScheduleDefinition<InferOutput<Task["input"]>>[];
    readonly admission?: JobAdmission<InferOutput<Task["input"]>>;
    readonly client?: JobClientAccess<StreamsOf<Task>>;
    readonly trigger: (
      input: InferInput<Task["input"]>,
      options?: ServerTriggerOptions,
    ) => Promise<RunHandle>;
  };

export type JobRunResultOptions = RunResultOptions;

/** Erases task-specific admission keys at runtime boundaries without making concrete jobs invariant. */
export type JobDescriptorAny = Omit<
  JobDescriptor<string, string, TaskDescriptorAny>,
  "admission" | "trigger"
> & {
  readonly admission?: JobAdmission<any>;
  readonly trigger: (input: any, options?: ServerTriggerOptions) => Promise<RunHandle>;
};
