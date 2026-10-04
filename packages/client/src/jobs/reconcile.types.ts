import type { ExpectedClientIdentity } from "@relkit/contracts";

/** A native job procedure callable preserving unknown request and result authority. */
export type Procedure = (...args: readonly unknown[]) => unknown;

/** Run identity, retained cursor and optional expected application identity. */
export interface WatchRequest {
  readonly runId: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
}
