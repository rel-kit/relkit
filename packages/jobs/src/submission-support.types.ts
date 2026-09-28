import type { JobUnknownOutcome } from "@relkit/contracts/jobs";

/** Submission response that requires recovery after an uncertain native write. */
export type UnknownSubmissionOutcome = JobUnknownOutcome & {
  readonly recovery: JobUnknownOutcome["recovery"];
};
