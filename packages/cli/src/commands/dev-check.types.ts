import type { CheckResult } from "./check-result.js";

/** Data-only input for one development check, isolated from the stable HTTP proxy. */
export interface DevCheckRequest {
  readonly projectRoot: string;
  readonly generationId: string;
}

/** One result sent over the private parent/child IPC channel. */
export type DevCheckResponse = { readonly result: CheckResult } | { readonly error: string };
