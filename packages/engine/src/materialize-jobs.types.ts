import type { JsonValue, MaybePromise, TracePropagation } from "@relkit/contracts";
import type { QueueRegistration, RegistrationPlan } from "@relkit/graph";
import type { SpanRuntime } from "@relkit/invocation";
import type {
  IdempotencyDefinition,
  JobState,
  RetryPolicy,
  ScheduleDefinition,
} from "@relkit/jobs/legacy";
import type { PublicFailureEnvelope } from "@relkit/runtime-effect";
import type { InvokeOptions } from "./invoke-types.js";

/** Shared durable queue idempotency policy. */
export type JobIdempotencyDefinition = IdempotencyDefinition<Record<string, unknown>>;

/** Persistable safe failure information attached to a queue transition. */
export type JobFailureMetadata = PublicFailureEnvelope;

/** Shared durable queue lifecycle states. */
export type JobQueueState = JobState;

/** Persisted execution attempt, availability and producer propagation metadata. */
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
  readonly propagation?: TracePropagation;
}

/** Queue acceptance result including duplicate detection. */
export interface JobQueueAcceptance extends JobQueueEntry {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly idempotencyKey?: string;
  readonly idempotencyExpiresAt?: number;
}

/** Native durable queue authority; transition state remains provider-owned. */
export interface JobQueueHandle {
  readonly ready?: () => Promise<void>;
  readonly enqueue: (input: {
    readonly input: JsonValue;
    readonly profile?: string;
    readonly instanceId?: string;
    readonly acceptedAt?: number;
    readonly idempotency?: JobIdempotencyDefinition;
    readonly propagation?: TracePropagation;
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

/** Legacy job invocation with queue admission, attempt and propagation context. */
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

/** Native function invocation boundary used by legacy job attempts. */
export interface JobEngine {
  readonly invoke: (options: JobInvocationOptions) => Promise<unknown>;
}

/** Validated queue identity, concurrency, retry and idempotency settings. */
export interface JobPolicy {
  readonly jobId: string;
  readonly targetFunctionId: string;
  readonly profile: string;
  readonly retry: RetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly idempotency?: JobIdempotencyDefinition;
}

/** Logical queue registration and validated policy supplied to a provider factory. */
export interface JobQueueFactoryContext extends JobPolicy {
  readonly registration: QueueRegistration;
}

/** Explicit native queue creation seam used when no ready queue is supplied. */
export type JobQueueFactory = (context: JobQueueFactoryContext) => MaybePromise<JobQueueHandle>;

/** Preconstructed queue handles indexed by logical queue identity. */
export type JobQueueSource =
  ReadonlyMap<string, JobQueueHandle> | Readonly<Record<string, JobQueueHandle>>;

/** One schedule evaluation and its enqueue result or skipped status. */
export interface JobScheduleRun {
  readonly scheduleId: string;
  readonly fireAt: Date;
  readonly status: "enqueued" | "skipped";
  readonly result?: unknown;
}

/** Native scheduler authority bound to materialized enqueue callbacks. */
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

/** Verified job plan, queues, scheduler and deterministic retry inputs. */
export interface JobMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly engine: JobEngine;
  readonly queues?: JobQueueSource;
  readonly createQueue?: JobQueueFactory;
  readonly scheduler?: JobScheduler;
  readonly consumerConcurrency?: number | Readonly<Record<string, number>>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly spanRuntime?: SpanRuntime;
}

/** Optional caller-supplied acceptance identity and availability metadata. */
export interface JobEnqueueOptions {
  readonly instanceId?: string;
  readonly acceptedAt?: number;
}

/** Completed, delayed or dead-lettered outcome after durable state transition. */
export interface JobRunResult {
  readonly instanceId: string;
  readonly attempt: number;
  readonly state: Extract<JobQueueState, "completed" | "delayed" | "dead-lettered">;
  readonly entry: JobQueueEntry;
  readonly value?: unknown;
  readonly classification?: "retryable" | "non-retryable";
  readonly failure?: JobFailureMetadata;
}

/** One queue's validated policy and enqueue/attempt operations. */
export interface MaterializedJob {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly queue: JobQueueHandle;
  readonly policy: JobPolicy;
  readonly enqueue: (
    input: JsonValue,
    options?: JobEnqueueOptions,
    context?: import("@relkit/jobs/legacy").JobOperationContext,
  ) => Promise<JobQueueEntry>;
  readonly runNext: (instanceId?: string) => Promise<JobRunResult | undefined>;
}

/** Bound jobs and schedules with generation-wide dispatch helpers. */
export interface MaterializedJobs {
  readonly jobs: ReadonlyMap<string, MaterializedJob>;
  readonly queues: ReadonlyMap<string, JobQueueHandle>;
  readonly scheduler: JobScheduler;
  readonly runNext: (jobId: string, instanceId?: string) => Promise<JobRunResult | undefined>;
  readonly runDue: JobScheduler["runDue"];
  readonly tick: JobScheduler["tick"];
}
