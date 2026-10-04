/** Shared retention policy across exactly two native output readers. */
export interface CandidateOutputBudget {
  remaining: number;
  truncated: boolean;
}

/** One native stream's retained diagnostics and truthful truncation evidence. */
export interface RetainedCandidateOutput {
  readonly text: string;
  readonly truncated: boolean;
}
