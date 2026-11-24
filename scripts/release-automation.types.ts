/** Boundary contracts for trusted GitHub JSON reads and release workflow outputs. */
import type { ReleaseJobs, ReleaseRun } from "./release-automation.schemas.js";

/** A bounded authenticated API read; JSON is decoded by its owning operation. */
export type ReleaseApi = (path: string) => Promise<string>;

/** GitHub fields admitted before a run can authorize release work. */
export type ReleaseRunRecord = typeof ReleaseRun.Type;

/** Original upload interval and attempt, as reported by GitHub. */
export type ReleasePackJob = (typeof ReleaseJobs.Type.jobs)[number];

/** Fixed scalar outputs consumed by ci.yml, never executable instructions. */
export interface ReleaseDecision {
  readonly mode: "none" | "version" | "publish" | "recover";
  readonly sha: string;
  readonly artifact_id?: string;
  readonly artifact_run_id?: string;
  /** CI run that verified `sha`; its reports become release evidence. */
  readonly ci_run_id?: string;
  /** Full CI run of the commit the batch was versioned from, when `ci_run_id` ran the reduced release suite. */
  readonly evidence_run_id?: string;
}

/** The CI run that verified a main commit, and whether it ran on main or on the merged pull request. */
export interface ReleaseAuthority {
  readonly run: string;
  readonly source: "main" | "pull_request";
}
