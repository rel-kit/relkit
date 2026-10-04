import type { RunHandle } from "@relkit/contracts/jobs";
import type { JOBS_CONFORMANCE_FIXTURES } from "./jobs-conformance.js";
import type { OperationContext } from "@relkit/jobs/adapter";
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
