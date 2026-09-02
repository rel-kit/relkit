import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type {
  IdempotencyDefinition,
  JobState,
  RetryPolicy,
  ScheduleDefinition,
} from "@relkit/jobs";
import type { PublicFailureEnvelope } from "@relkit/runtime-effect";
import type { QueueRegistration, RegistrationPlan } from "@relkit/graph";
import type { InvokeOptions } from "./invoke-types.js";

export type JobIdempotencyDefinition = IdempotencyDefinition<Record<string, unknown>>;
export type JobFailureMetadata = PublicFailureEnvelope;
export type JobQueueState = JobState;

export interface JobQueueEntry {
  readonly instanceId: string;
  readonly state: JobQueueState;
  readonly input: JsonValue;
  readonly profile: string;
  readonly attempt: number;
  readonly acceptedAt: number;
  readonly order: number;
  readonly availableAt?: number;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: number;
  readonly failure?: JobFailureMetadata;
}

export interface JobQueueAcceptance extends JobQueueEntry {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly idempotencyKey?: string;
  readonly idempotencyExpiresAt?: number;
}

export interface JobQueueHandle {
  readonly ready?: () => Promise<void>;
  readonly enqueue: (input: {
    readonly input: JsonValue;
    readonly profile?: string;
    readonly instanceId?: string;
    readonly acceptedAt?: number;
    readonly idempotency?: JobIdempotencyDefinition;
  }) => Promise<JobQueueAcceptance>;
  readonly acquire: (
    instanceId?: string,
    options?: { readonly leaseDurationMs?: number; readonly leaseExpiresAt?: number },
  ) => Promise<JobQueueEntry | undefined>;
  readonly transition: (
    instanceId: string,
    state: JobQueueState,
    options?: {
      readonly expectedState?: JobQueueState;
      readonly attempt?: number;
      readonly availableAt?: number;
      readonly leaseOwner?: string;
      readonly leaseDurationMs?: number;
      readonly leaseExpiresAt?: number;
      readonly failure?: JobFailureMetadata;
    },
  ) => Promise<JobQueueEntry>;
  readonly get: (instanceId: string) => JobQueueEntry | undefined;
}

export type JobInvocationOptions = Omit<
  InvokeOptions<unknown, unknown>,
  "functionId" | "input" | "source" | "attempt" | "triggerLimit" | "timeoutMs"
> & {
  readonly functionId: string;
  readonly input: JsonValue;
  readonly source: "job";
  readonly attempt: number;
  readonly triggerLimit?: number;
  readonly timeoutMs?: number;
};

export interface JobEngine {
  readonly invoke: (options: JobInvocationOptions) => Promise<unknown>;
}

export interface JobPolicy {
  readonly jobId: string;
  readonly targetFunctionId: string;
  readonly profile: string;
  readonly retry: RetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly idempotency?: JobIdempotencyDefinition;
}

export interface JobQueueFactoryContext extends JobPolicy {
  readonly registration: QueueRegistration;
}

export type JobQueueFactory = (context: JobQueueFactoryContext) => MaybePromise<JobQueueHandle>;
export type JobQueueSource =
  ReadonlyMap<string, JobQueueHandle> | Readonly<Record<string, JobQueueHandle>>;

export interface JobScheduleRun {
  readonly scheduleId: string;
  readonly fireAt: Date;
  readonly status: "enqueued" | "skipped";
  readonly result?: unknown;
}

export interface JobScheduler {
  readonly register: (
    schedule: ScheduleDefinition,
    enqueue: (
      input: JsonValue,
      context: { readonly scheduleId: string; readonly fireAt: Date },
    ) => MaybePromise<unknown>,
  ) => unknown;
  readonly nextFire: (scheduleId: string) => Date | undefined;
  readonly runDue: (currentDate?: Date | number) => Promise<readonly JobScheduleRun[]>;
  readonly tick: (currentDate?: Date | number) => Promise<readonly JobScheduleRun[]>;
}

export interface JobMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly engine: JobEngine;
  readonly queues?: JobQueueSource;
  readonly createQueue?: JobQueueFactory;
  readonly scheduler?: JobScheduler;
  readonly consumerConcurrency?: number | Readonly<Record<string, number>>;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface JobEnqueueOptions {
  readonly instanceId?: string;
  readonly acceptedAt?: number;
}

export interface JobRunResult {
  readonly instanceId: string;
  readonly attempt: number;
  readonly state: Extract<JobQueueState, "completed" | "delayed" | "dead-lettered">;
  readonly entry: JobQueueEntry;
  readonly value?: unknown;
  readonly classification?: "retryable" | "non-retryable";
  readonly failure?: JobFailureMetadata;
}

export interface MaterializedJob {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly queue: JobQueueHandle;
  readonly policy: JobPolicy;
  readonly enqueue: (input: JsonValue, options?: JobEnqueueOptions) => Promise<JobQueueEntry>;
  readonly runNext: (instanceId?: string) => Promise<JobRunResult | undefined>;
}

export interface MaterializedJobs {
  readonly jobs: ReadonlyMap<string, MaterializedJob>;
  readonly queues: ReadonlyMap<string, JobQueueHandle>;
  readonly scheduler: JobScheduler;
  readonly runNext: (jobId: string, instanceId?: string) => Promise<JobRunResult | undefined>;
  readonly runDue: JobScheduler["runDue"];
  readonly tick: JobScheduler["tick"];
}

export class JobMaterializationError extends Error {
  readonly code = "RELKIT_JOB_MATERIALIZATION_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobMaterializationError";
  }
}
