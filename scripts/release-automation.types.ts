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
}
