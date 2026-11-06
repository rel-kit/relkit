import type { RunHandle } from "relkit/contracts/jobs";
import type { JOBS_CONFORMANCE_FIXTURES } from "./jobs-conformance.js";
import type { JobsAdapterRuntime, OperationContext } from "relkit/jobs/adapter";
import type { TestJobsAdapter } from "./test-jobs-adapter.js";

/** Native adapter fixture inputs for reusable jobs contract assertions. */
export interface JobsConformanceFixture {
  readonly id: string;
  readonly description: string;
}

/** Owned native jobs conformance operations and completion controls. */
export interface JobsConformanceHarness {
  readonly adapter: TestJobsAdapter;
  readonly context: OperationContext;
  readonly fixtures: typeof JOBS_CONFORMANCE_FIXTURES;
  readonly run: (fixtureId: string) => Promise<RunHandle | undefined>;
}

/** A jobs adapter under test; `close` runs after each case when present. */
export type JobsConformanceProvider = JobsAdapterRuntime & {
  readonly close?: () => Promise<unknown>;
};

/** What a jobs provider supplies to run the shared suite. */
export interface JobsProviderConformanceOptions {
  /** Creates an adapter for one case. */
  readonly create: () => JobsConformanceProvider;
  /**
   * Failure injection: an adapter that commits a submission but loses the response, so the
   * submission's outcome is unknown. The `unknown-acknowledgement` case is skipped without it.
   */
  readonly faulty?: () => JobsConformanceProvider;
}
