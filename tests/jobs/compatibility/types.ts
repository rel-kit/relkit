export type FixtureStatus = "queued" | "running" | "sleeping" | "completed";

export interface StoredWait {
  readonly key: string;
  readonly dueAt: number;
  completed: boolean;
}

export interface StoredRun {
  readonly runId: string;
  readonly nativeId: string;
  readonly key: string;
  readonly buildId: string;
  status: FixtureStatus;
  attempt: number;
  readonly acceptedAt: number;
  readonly retentionExpiresAt: number;
  readonly waits: Map<string, StoredWait>;
}

export interface FixtureStorage {
  readonly runs: Map<string, StoredRun>;
  readonly keys: Map<string, string>;
  readonly events: Map<string, NativeObservation[]>;
}

export interface RunSnapshot {
  readonly runId: string;
  readonly nativeId: string;
  readonly key: string;
  readonly buildId: string;
  readonly status: FixtureStatus;
  readonly attempt: number;
  readonly acceptedAt: number;
  readonly retentionExpiresAt: number;
  readonly waits: readonly StoredWait[];
}

export interface NativeObservation {
  readonly kind: "snapshot" | "update";
  readonly sequence: number;
  readonly run: RunSnapshot;
}

export interface SubmitRequest {
  readonly key: string;
  readonly buildId: string;
  readonly operationId?: string;
}

export interface NativeReceipt {
  readonly accepted: true;
  readonly runId: string;
  readonly nativeId: string;
  readonly duplicate?: boolean;
}

export class UnknownAcceptanceError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_UNKNOWN" as const;

  constructor(
    readonly operationId: string,
    readonly idempotencyKey: string,
  ) {
    super("Native acceptance response was lost; inspect or retry with the same key.");
    this.name = "UnknownAcceptanceError";
  }
}

export interface FailureControls {
  readonly once: (point: string, cause: unknown) => void;
  readonly check: (point: string) => void;
}

export interface NativeFixtureApi {
  readonly submit: (request: SubmitRequest) => Promise<NativeReceipt>;
  readonly routeEvent: (eventId: string, buildId: string) => Promise<NativeReceipt>;
  readonly get: (runId: string) => Promise<RunSnapshot>;
  readonly beginAttempt: (runId: string) => RunSnapshot;
  readonly failAttempt: (runId: string) => RunSnapshot;
  readonly commitWait: (runId: string, key: string, dueAt: number) => RunSnapshot;
  readonly completeWait: (runId: string, key: string) => RunSnapshot;
  readonly resume: (runId: string) => RunSnapshot;
  readonly complete: (runId: string) => RunSnapshot;
  readonly observe: (runId: string) => AsyncIterable<NativeObservation>;
}

export interface FixtureHarness {
  readonly namespace: string;
  readonly storage: FixtureStorage;
  readonly workers: {
    readonly active: ReadonlySet<string>;
    readonly start: (id: string) => void;
    readonly stop: (id: string) => void;
  };
  readonly failures: FailureControls;
  readonly native: NativeFixtureApi;
  readonly close: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
}
