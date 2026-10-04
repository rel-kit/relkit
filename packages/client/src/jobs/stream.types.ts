import type { ExpectedClientIdentity } from "@relkit/contracts";
/** Existing content bounds and request authority for one named stream. */
export interface JobStreamOptions {
  readonly runId: string;
  readonly name: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
  readonly signal?: AbortSignal;
  readonly readTimeoutMs?: number;
  readonly maxFrames?: number;
  readonly maxBytes?: number;
  readonly maxItemBytes?: number;
}
