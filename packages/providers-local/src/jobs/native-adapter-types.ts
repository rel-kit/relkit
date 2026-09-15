import type { JobErrorEnvelope, JobWireEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";
import type { JobStore } from "./store.js";

export interface LocalNativeNamespace {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
}

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

export interface LocalNativeState {
  readonly runs: Map<string, LocalNativeRun>;
  readonly idempotency: Map<string, string>;
  readonly retryControls: Map<string, unknown>;
  readonly cancelControls: Map<string, unknown>;
  store?: JobStore;
}
