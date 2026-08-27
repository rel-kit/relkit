import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { JobQueueEntry } from "@relkit/providers-local";
import {
  createScheduler,
  type JobFailureMetadata,
  type JobIdempotencyDefinition,
  type JobQueue,
  type JobQueueState,
  type Scheduler,
} from "@relkit/providers-local";
import type { QueueRegistration, RegistrationPlan } from "@relkit/graph";
import type { RetryPolicy } from "@relkit/jobs";
import type { InvokeOptions } from "./invoke-types.js";
import { createConcurrencyAdmission, effectiveConcurrencyLimit } from "./concurrency.js";
import { bindSchedule, createAdmit } from "./materialize-jobs-utils.js";
import { createBinding } from "./materialize-jobs-binding.js";
import { consumerLimit, readPolicy, resolveQueue } from "./materialize-jobs-utils.js";

export type JobQueueHandle = Pick<JobQueue, "enqueue" | "acquire" | "transition" | "get"> &
  Partial<Pick<JobQueue, "ready">>;
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
export interface JobMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly engine: JobEngine;
  readonly queues?: JobQueueSource;
  readonly createQueue?: JobQueueFactory;
  readonly scheduler?: Scheduler;
  readonly schedulerOptions?: {
    readonly now?: () => Date | number;
    readonly clock?: { readonly now: () => Date | number };
  };
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
  readonly scheduler: Scheduler;
  readonly runNext: (jobId: string, instanceId?: string) => Promise<JobRunResult | undefined>;
  readonly runDue: Scheduler["runDue"];
  readonly tick: Scheduler["tick"];
}

export class JobMaterializationError extends Error {
  readonly code = "RELKIT_JOB_MATERIALIZATION_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobMaterializationError";
  }
}

/** Binds planned queues and schedules to the already-constructed function engine. */
export async function materializeJobs(
  options: JobMaterializationOptions,
): Promise<MaterializedJobs> {
  const functions = new Map(options.plan.functions.map((item) => [item.id, item]));
  const admission = createConcurrencyAdmission();
  const jobs = new Map<string, MaterializedJob>();
  const queues = new Map<string, JobQueueHandle>();

  for (const registration of options.plan.queues) {
    if (jobs.has(registration.id))
      throw new JobMaterializationError(`Duplicate queue "${registration.id}"`);
    const policy = readPolicy(registration);
    const functionNode = functions.get(policy.targetFunctionId);
    if (functionNode === undefined)
      throw new JobMaterializationError(`Job "${policy.jobId}" targets an unknown function`);
    const queue = await resolveQueue(registration, policy, options);
    await queue.ready?.();
    const triggerLimit = effectiveConcurrencyLimit(
      policy.concurrency,
      consumerLimit(options.consumerConcurrency, policy.jobId),
    );
    const functionLimit = functionNode.concurrency ?? undefined;
    const effectiveLimit = effectiveConcurrencyLimit(functionLimit, triggerLimit);
    const admit = createAdmit(admission, policy, functionLimit, effectiveLimit);
    const binding = createBinding(queue, policy, admit, effectiveLimit, options);
    jobs.set(policy.jobId, binding);
    queues.set(policy.jobId, queue);
  }

  const scheduler = options.scheduler ?? createScheduler(options.schedulerOptions);
  for (const registration of options.plan.schedules) bindSchedule(scheduler, registration, jobs);
  const runNext = (jobId: string, instanceId?: string) => {
    const job = jobs.get(jobId);
    if (job === undefined) throw new JobMaterializationError(`Unknown job "${jobId}"`);
    return job.runNext(instanceId);
  };
  return Object.freeze({
    jobs,
    queues,
    scheduler,
    runNext,
    runDue: scheduler.runDue,
    tick: scheduler.tick,
  });
}
