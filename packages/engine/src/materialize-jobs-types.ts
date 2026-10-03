export type {
  JobEngine,
  JobEnqueueOptions,
  JobFailureMetadata,
  JobIdempotencyDefinition,
  JobInvocationOptions,
  JobMaterializationOptions,
  JobPolicy,
  JobQueueAcceptance,
  JobQueueEntry,
  JobQueueFactory,
  JobQueueFactoryContext,
  JobQueueHandle,
  JobQueueSource,
  JobQueueState,
  JobRunResult,
  JobScheduleRun,
  JobScheduler,
  MaterializedJob,
  MaterializedJobs,
} from "./materialize-jobs.types.js";

/** Compatibility failure for invalid legacy queue or schedule plans. */
export class JobMaterializationError extends Error {
  readonly code = "RELKIT_JOB_MATERIALIZATION_INVALID" as const;

  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param message - Safe compatibility diagnostic.
   * @returns undefined
   */
  constructor(message: string) {
    super(message);
    this.name = "JobMaterializationError";
  }
}
