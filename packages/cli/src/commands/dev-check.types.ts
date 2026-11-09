import type { CheckResult } from "./check-result.js";

/** Data-only input for one development check, isolated from the stable HTTP proxy. */
export interface DevCheckRequest {
  readonly projectRoot: string;
  readonly generationId: string;
}

/** One request sent to the warm checker, correlated with its response. */
export interface DevCheckMessage extends DevCheckRequest {
  readonly id: number;
}

/** One result sent over the private parent/child IPC channel. */
export type DevCheckResponse =
  | {
      readonly id: number;
      readonly result: CheckResult;
      /** Candidates the warm evaluator imported again for this check. */
      readonly reimported?: readonly string[];
    }
  | { readonly id: number; readonly error: string };
