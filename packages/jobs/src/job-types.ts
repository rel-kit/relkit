import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  JobUnknownOutcome,
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

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger-types.js";

export type ScheduleOverlap = "allow" | "skip";
export type ScheduleMisfire = "skip" | "latest" | "all";

export type RetryJitter = "none" | "full" | "equal";
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RetryJitter;
}

export type ScheduleDefinition<Input = unknown> = {
  readonly id: string;
  readonly input: Input;
  readonly overlap?: ScheduleOverlap;
  readonly misfire?: ScheduleMisfire;
} & (
  | { readonly cron: string; readonly timezone: string; readonly every?: never }
  | { readonly every: DurationInput; readonly cron?: never; readonly timezone?: never }
);

export interface ScheduleRecord<Definition = ScheduleDefinition> {
  readonly id: string;
  readonly jobId: string;
  readonly state: "active" | "paused" | "missing" | "unknown";
  readonly definition: Definition;
  readonly observedAt?: string;
}

export interface ScheduleReadReceipt<Definition = ScheduleDefinition> {
  readonly outcome: "available" | "unavailable";
  readonly schedule?: ScheduleRecord<Definition>;
  readonly schedules?: readonly ScheduleRecord<Definition>[];
  readonly nextCursor?: string;
  readonly hasMore?: boolean;
  readonly reason?: string;
}

export type ScheduleWriteOutcome =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "deleted"
  | "requested"
  | "unsupported";

export interface ScheduleListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface ScheduleWriteOptions {
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

export type ScheduleWriteReceipt<Definition = ScheduleDefinition> =
  | {
      readonly operationId: string;
      readonly scheduleId: string;
      readonly outcome: ScheduleWriteOutcome;
      readonly schedule?: ScheduleRecord<Definition>;
    }
  | (JobUnknownOutcome & { readonly scheduleId: string });

export interface JobScheduleClient<Definition = ScheduleDefinition> {
  readonly list: (options?: ScheduleListOptions) => Promise<ScheduleReadReceipt<Definition>>;
  readonly get: (id: string, options?: { readonly signal?: AbortSignal }) => Promise<ScheduleReadReceipt<Definition>>;
  readonly upsert: (definition: Definition, options: ScheduleWriteOptions) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly pause: (id: string, options: ScheduleWriteOptions) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly resume: (id: string, options: ScheduleWriteOptions) => Promise<ScheduleWriteReceipt<Definition>>;
  readonly delete: (id: string, options: ScheduleWriteOptions) => Promise<ScheduleWriteReceipt<Definition>>;
}

export interface JobAdmission<Input = unknown> {
  readonly pastAt?: "run" | "reject";
  readonly idempotency?: {
    readonly key?: Extract<keyof Input, string>;
    readonly retention?: DurationInput;
  };
}

export type JobClientField = "status" | "input" | "progress" | "output" | "error";
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
    readonly observation?: TaskObservation<Task["streams"] extends TaskStreamSchemas ? Task["streams"] : {}>;
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

export type JobDescriptorAny = JobDescriptor<string, string, TaskDescriptorAny>;
