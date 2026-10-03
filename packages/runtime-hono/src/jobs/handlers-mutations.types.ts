import type { cancelJobRunEffect } from "./handlers-mutations-cancel.js";
import type { retryJobRunEffect } from "./handlers-mutations-retry.js";
import type { triggerJobEffect } from "./handlers-mutations-trigger.js";

/** Authorized job submission and control operations supplied by the live transport layer. */
export interface JobsMutationOperations {
  readonly triggerJob: typeof triggerJobEffect;
  readonly cancelJobRun: typeof cancelJobRunEffect;
  readonly retryJobRun: typeof retryJobRunEffect;
}
