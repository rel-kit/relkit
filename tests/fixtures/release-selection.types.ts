/** Deterministic server states used by the real release CLI subprocess fixture. */
export interface ReleaseFixtureState {
  readonly sha?: string;
  readonly executionSha?: string;
  readonly mainSha?: string;
  readonly ciSha?: string;
  readonly complete?: boolean;
  readonly previous?: boolean;
  readonly expired?: boolean;
  readonly missing?: boolean;
  readonly noCi?: boolean;
  readonly dispatchFails?: boolean;
}
