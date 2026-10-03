import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { createConcurrencyAdmission, effectiveConcurrencyLimit } from "./concurrency.js";
import { enginePromise, engineTry, runEnginePromise } from "./engine-runtime.js";
import { createBinding } from "./materialize-jobs-binding.js";
import { bindSchedule } from "./materialize-jobs-schedule.js";
import type {
  JobMaterializationOptions,
  JobQueueHandle,
  JobScheduler,
  MaterializedJob,
  MaterializedJobs,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";
import {
  consumerLimit,
  createAdmit,
  readPolicy,
  resolveQueueEffect,
} from "./materialize-jobs-utils.js";

export * from "./materialize-jobs-types.js";

/** Bind verified legacy queue and schedule plans to explicit provider authorities.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding bound queues and schedules; invalid plans fail with JobMaterializationError.
 */
export const materializeJobsEffect = Effect.fn("Engine.materializeJobs")(
  function* (options: JobMaterializationOptions) {
    const scheduler = yield* engineTry(() => resolveScheduler(options));
    const functions = new Map(options.plan.functions.map((item) => [item.id, item]));
    const admission = createConcurrencyAdmission();
    const jobs = new Map<string, MaterializedJob>();
    const queues = new Map<string, JobQueueHandle>();

    yield* Effect.forEach(
      options.plan.queues,
      (registration) =>
        Effect.gen(function* () {
          if (jobs.has(registration.id))
            return yield* Effect.fail(
              new JobMaterializationError(`Duplicate queue "${registration.id}"`),
            );
          const policy = yield* engineTry(() => readPolicy(registration));
          const functionNode = functions.get(policy.targetFunctionId);
          if (functionNode === undefined)
            return yield* Effect.fail(
              new JobMaterializationError(`Job "${policy.jobId}" targets an unknown function`),
            );
          const queue = yield* resolveQueueEffect(registration, policy, options);
          yield* enginePromise(() => Promise.resolve(queue.ready?.()));
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
        }),
      { discard: true },
    );

    yield* Effect.forEach(
      options.plan.schedules,
      (registration) =>
        engineTry(() => bindSchedule(scheduler, registration, jobs, options.spanRuntime)),
      { discard: true },
    );
    /** Dispatch one leased attempt through a materialized job binding.
     * @param jobId - Registered job whose queue should supply the attempt.
     * @param instanceId - Optional specific queue entry to acquire.
     * @returns The binding's attempt Promise; unknown job IDs throw before acquisition.
     */
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
  },
  (effect, options) =>
    observeExecution("engine", "materializeJobs", effect, () => ({
      queues: options.plan.queues.length,
      schedules: options.plan.schedules.length,
    })),
);

/** Bind verified legacy queue and schedule plans to explicit provider authorities.
 * @returns A Promise of bound queue and schedule operations.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function materializeJobs(
  options: JobMaterializationOptions,
): Promise<MaterializedJobs> {
  return runEnginePromise(materializeJobsEffect(options));
}

const emptyRuns = Object.freeze([]);
const emptyScheduler: JobScheduler = Object.freeze({
  register: () => {
    throw new JobMaterializationError("Cannot register a schedule without a scheduler provider");
  },
  nextFire: () => undefined,
  runDue: async () => emptyRuns,
  tick: async () => emptyRuns,
});

/** Require the explicitly supplied scheduler for planned schedules.
 * @returns The explicit scheduler required by planned schedules.
 * @param options - Explicit configuration and dependencies for this operation.
 */
function resolveScheduler(options: JobMaterializationOptions): JobScheduler {
  if (options.scheduler !== undefined) return options.scheduler;
  if (options.plan.schedules.length > 0) {
    throw new JobMaterializationError("No scheduler provider is bound for planned job schedules");
  }
  return emptyScheduler;
}
