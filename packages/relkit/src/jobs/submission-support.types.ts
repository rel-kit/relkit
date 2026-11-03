import type { JobUnknownOutcome } from "../contracts/jobs.js";

/** Submission response that requires recovery after an uncertain native write. */
export type UnknownSubmissionOutcome = JobUnknownOutcome & {
  readonly recovery: JobUnknownOutcome["recovery"];
};
