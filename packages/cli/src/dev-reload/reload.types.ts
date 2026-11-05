/** Inputs and outcomes of an in-place development reload. */
import type { Effect } from "effect";
import type { StartedCandidate } from "../supervisor/index.js";
import type { CheckResult } from "../commands/check-result.types.js";
import type { DevLog } from "../commands/dev.types.js";

/** One save offered to the in-place reload before the blue/green path. */
export interface DevReloadRequest {
  /** Generation currently serving traffic. */
  readonly candidate: StartedCandidate;
  /** Admitted source version. */
  readonly version: number;
  /** Changed paths reported by the watcher, project-relative. */
  readonly changedFiles: readonly string[];
  /** Session shutdown and supersession. */
  readonly signal: AbortSignal;
  readonly log: DevLog;
}

/**
 * What happened to a save:
 * `swapped` - the serving process loaded the new handlers;
 * `failed` - the sources do not evaluate or compile, and the previous handlers keep serving;
 * `restart` - the change needs a new generation, built through blue/green.
 */
export type DevReloadOutcome = "swapped" | "failed" | "restart";

/**
 * Offers one save to the in-place reload.
 * @param request - Serving generation and the save.
 * @returns The outcome; it never fails, so every save still reaches a decision.
 */
export type DevReload = (request: DevReloadRequest) => Effect.Effect<DevReloadOutcome>;

/** Files and identity for one handler-table swap. */
export interface SwapRequest {
  readonly candidate: StartedCandidate;
  readonly checked: CheckResult;
  readonly version: number;
  readonly projectRoot: string;
  readonly signal: AbortSignal;
}
