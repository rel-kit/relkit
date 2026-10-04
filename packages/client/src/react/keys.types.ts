/** Backend, fingerprint, transport, identity and session boundaries of cached client work. */
export interface RelkitKeyScope {
  readonly backend: string;
  readonly applicationId: string;
  readonly identityScope: string;
  readonly sessionEpoch: string;
  readonly identityKey: string | null | undefined;
  readonly publicFingerprint: string;
  readonly environment?: string;
  readonly jobsProtocolVersion?: number;
}

/** Run, cursor, named-content and projection fields participating in a job cache key. */
export interface RelkitJobKeyOptions {
  readonly jobId: string;
  readonly runId?: string;
  readonly projection?: string;
  readonly schemaVersion?: string;
  readonly environment?: string;
  readonly jobsProtocolVersion?: number;
}
