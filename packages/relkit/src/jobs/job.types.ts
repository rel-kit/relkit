import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "../contracts/index.js";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  JobRef,
  RunHandle,
} from "../contracts/jobs.js";
import type { ErrorDescriptorAny } from "../functions/index.js";
import type { InferInput, InferOutput, StandardSchemaV1 } from "../schema/index.js";
import type { DurationInput } from "./duration.js";
import type { ValidJobName } from "./job-name.js";
import type {
  TaskDescriptorAny,
  TaskDependencies,
  TaskObservation,
  TaskStreamSchemas,
} from "./task-types.js";
import type { RunResultOptions, ServerTriggerOptions } from "./trigger.types.js";
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
} from "./schedule.types.js";

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
} from "./schedule.types.js";

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger.types.js";

/** Jitter strategy for a retry policy. */
export type RetryJitter = "none" | "full" | "equal";
/** Retry attempts, delays, multiplier, and jitter for event delivery. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RetryJitter;
}

/** Policy for late schedules and idempotent submissions. */
export interface JobAdmission<Input = unknown> {
  /** Whether a trigger whose start time is already past is run or rejected. */
  readonly pastAt?: "run" | "reject";
  /** Repeated triggers with the same value of the input field `key` reuse the first run. */
  readonly idempotency?: {
    readonly key?: Extract<keyof Input, string>;
    readonly retention?: DurationInput;
  };
}

/** Run fields that authorization may expose to a client. */
export type JobClientField = "status" | "input" | "progress" | "output" | "error";
/** Trusted scope and optional subject data passed to an access policy. */
export interface JobAuthorizationContext {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
  readonly auth?: unknown;
  readonly run?: import("../contracts/jobs.js").RunSnapshot;
}
/** Public or policy-guarded operations and fields exposed to clients. */
export type JobClientAccess<Streams extends TaskStreamSchemas = TaskStreamSchemas> =
  | {
      /** Exposes the listed operations to every caller. */
      readonly public: true;
      /** Operations the client may call, such as `"trigger"`, `"watch"` and `"cancel"`. */
      readonly operations: readonly JobClientOperation[];
      /** Run fields the client may read, such as `"status"`, `"progress"` and `"output"`. */
      readonly fields?: readonly JobClientField[];
      /** Names of the task's streams the client may read. */
      readonly streams?: readonly (keyof Streams & string)[];
    }
  | {
      /** Called for each client request; returns the caller's scope, or throws to deny access. */
      readonly authorize: (
        request: JobAccessRequest,
        context: JobAuthorizationContext,
      ) => MaybePromise<JobAccessGrant>;
      readonly public?: never;
      /** Operations the client may call, such as `"trigger"`, `"watch"` and `"cancel"`. */
      readonly operations: readonly JobClientOperation[];
      /** Run fields the client may read, such as `"status"`, `"progress"` and `"output"`. */
      readonly fields?: readonly JobClientField[];
      /** Names of the task's streams the client may read. */
      readonly streams?: readonly (keyof Streams & string)[];
    };

/** Jobs service that runs the job. */
export interface JobServiceSelection {
  /** Name of the jobs service that runs the job; the application's default when omitted. */
  readonly service?: string;
}

type StreamsOf<Task extends TaskDescriptorAny> = [NonNullable<Task["streams"]>] extends [never]
  ? {}
  : NonNullable<Task["streams"]> extends TaskStreamSchemas
    ? NonNullable<Task["streams"]>
    : {};

/** Options accepted for define job operations. */
export type DefineJobOptions<
  Name extends string,
  Task extends TaskDescriptorAny,
  Id extends string = Name,
> = DescriptorMetadata &
  JobServiceSelection & {
    /** Public name of the job; the generated client calls it as `client.jobs.<name>`. */
    readonly name: Name & ValidJobName<Name>;
    /** Stable ID of the job. Defaults to `name`. */
    readonly id?: Id;
    /** The task that every run of the job executes. */
    readonly task: Task;
    /** Marks the job that a trigger of the task itself uses when the task has several jobs. */
    readonly default?: boolean;
    /** Schedules that start runs, each with its `input` and a cron rule or an interval. */
    readonly schedules?: readonly ScheduleDefinition<InferInput<Task["input"]>>[];
    /** How a run is accepted: a start time in the past, and the input field that deduplicates. */
    readonly admission?: JobAdmission<InferOutput<Task["input"]>>;
    /** What the generated client may do with the job; the job is private when omitted. */
    readonly client?: JobClientAccess<StreamsOf<Task>>;
  };

/** Validated job definition and its task-specific trigger operation. */
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

/** Options accepted for job run result operations. */
export type JobRunResultOptions = RunResultOptions;

/** Erases task-specific admission keys at runtime boundaries without making concrete jobs invariant. */
export type JobDescriptorAny = Omit<
  JobDescriptor<string, string, TaskDescriptorAny>,
  "admission" | "trigger"
> & {
  readonly admission?: JobAdmission<any>;
  readonly trigger: (input: any, options?: ServerTriggerOptions) => Promise<RunHandle>;
};
