/** Shapes shared by every RelKit conformance suite in `@relkit/testing`. */

/** One case of a conformance suite. Every provider of a kind runs the same cases. */
export interface ConformanceCase<Id extends string = string> {
  readonly id: Id;
  readonly description: string;
}

/**
 * Cases plus a runner. `run` resolves when the provider passes the case, resolves `"skipped"` when
 * the provider declares it does not support what the case checks, and rejects with a description
 * of the first broken expectation otherwise.
 */
export interface ConformanceHarness<Id extends string = string> {
  readonly suite: string;
  readonly cases: readonly ConformanceCase<Id>[];
  readonly run: (caseId: Id) => Promise<void | "skipped">;
}

/** The outcome of one case. */
export interface ConformanceCaseResult {
  readonly id: string;
  readonly description: string;
  readonly outcome: "pass" | "fail" | "skip";
  /** The failure message when `outcome` is `"fail"`. */
  readonly error?: string;
}

/** Results of every case of one suite run against one provider. */
export interface ConformanceReport {
  readonly suite: string;
  readonly results: readonly ConformanceCaseResult[];
  /** True when no case failed. */
  readonly passed: boolean;
}
