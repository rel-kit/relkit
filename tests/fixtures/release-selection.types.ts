/** Deterministic server states used by the real release CLI subprocess fixture. */
export interface ReleaseFixtureState {
  readonly sha?: string;
  readonly executionSha?: string;
  readonly mainSha?: string;
  readonly ciSha?: string;
  readonly complete?: boolean;
  readonly previous?: boolean;
  /** Event that started the earlier Release run; a dispatch by default. */
  readonly previousEvent?: string;
  readonly expired?: boolean;
  readonly missing?: boolean;
  readonly noCi?: boolean;
  readonly dispatchFails?: boolean;
  /** Merged pull requests by main commit: the CI run of each and the Git tree that run recorded. */
  readonly pullRuns?: Readonly<Record<string, ReleaseFixturePullRun>>;
  /** An open release pull request, built on current main or on an older commit. */
  readonly releasePull?: "current" | "stale";
}

/** One merged pull request's CI run as the fake GitHub boundary reports it. */
export interface ReleaseFixturePullRun {
  readonly id: number;
  readonly tree: string;
  readonly fork?: boolean;
  readonly conclusion?: string;
}
