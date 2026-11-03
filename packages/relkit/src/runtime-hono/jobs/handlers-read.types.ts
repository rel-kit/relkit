import type { getJobRunEffect } from "./handlers-read-get.js";
import type { listJobRunsEffect } from "./handlers-read-list.js";
import type { watchJobRunEffect } from "./handlers-read-watch.js";

/** Authorized job read and observation operations supplied by the live transport layer. */
export interface JobsReadOperations {
  readonly getJobRun: typeof getJobRunEffect;
  readonly listJobRuns: typeof listJobRunsEffect;
  readonly watchJobRun: typeof watchJobRunEffect;
}
