import type { JobErrorEnvelope, JobWireEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";

/** Mutable deterministic native run state with owned worker cancellation. */
export interface TestNativeRun {
  readonly request: NativeSubmission;
  readonly runId: string;
  readonly acceptedAt: string;
  status: RunSnapshot["status"];
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: JobErrorEnvelope;
  retryOfRunId?: string;
  readonly canonicalInput: JobWireEnvelope;
  controller?: AbortController;
  disposeSignal?: () => void;
}
