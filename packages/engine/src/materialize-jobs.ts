import { createConcurrencyAdmission, effectiveConcurrencyLimit } from "./concurrency.js";
import { createAdmit } from "./materialize-jobs-utils.js";
import { bindSchedule } from "./materialize-jobs-schedule.js";
import { createBinding } from "./materialize-jobs-binding.js";
import { consumerLimit, readPolicy, resolveQueue } from "./materialize-jobs-utils.js";
import type {
  JobMaterializationOptions,
  JobQueueHandle,
  JobScheduler,
  MaterializedJob,
  MaterializedJobs,
} from "./materialize-jobs-types.js";
import { JobMaterializationError } from "./materialize-jobs-types.js";

export * from "./materialize-jobs-types.js";

/** Binds planned queues and schedules to the already-constructed function engine. */
export async function materializeJobs(
  options: JobMaterializationOptions,
): Promise<MaterializedJobs> {
  const scheduler = resolveScheduler(options);
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

  for (const registration of options.plan.schedules)
    bindSchedule(scheduler, registration, jobs, options.spanRuntime);
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

const emptyRuns = Object.freeze([]);
const emptyScheduler: JobScheduler = Object.freeze({
  register: () => {
    throw new JobMaterializationError("Cannot register a schedule without a scheduler provider");
  },
  nextFire: () => undefined,
  runDue: async () => emptyRuns,
  tick: async () => emptyRuns,
});

function resolveScheduler(options: JobMaterializationOptions): JobScheduler {
  if (options.scheduler !== undefined) return options.scheduler;
  if (options.plan.schedules.length > 0) {
    throw new JobMaterializationError("No scheduler provider is bound for planned job schedules");
  }
  return emptyScheduler;
}
