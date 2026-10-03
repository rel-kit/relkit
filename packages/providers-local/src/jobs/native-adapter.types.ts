import type { JobErrorEnvelope, JobWireEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";
import type { JobStore } from "./store.js";

/** Application, environment and scope isolating native job records. */
export interface LocalNativeNamespace {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
}

/** Mutable native run state including persisted metadata and attempt-owned resources. */
export interface LocalNativeRun {
  request: NativeSubmission;
  readonly namespace: LocalNativeNamespace;
  readonly service: string;
  readonly runId: string;
  readonly acceptedAt: string;
  status: RunSnapshot["status"];
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  nextEligibleAt?: string;
  output?: unknown;
  error?: JobErrorEnvelope;
  readonly retryOfRunId?: string;
  readonly canonicalInput: JobWireEnvelope;
  readonly completedSleeps: Set<string>;
  controller?: AbortController;
  controllerCleanup?: () => void;
}

/** Service-owned run, deduplication and control indexes with recovered journal. */
export interface LocalNativeState {
  readonly runs: Map<string, LocalNativeRun>;
  readonly idempotency: Map<string, string>;
  readonly retryControls: Map<string, unknown>;
  readonly cancelControls: Map<string, unknown>;
  store?: JobStore;
}
