import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { JobWatchOptions, JobWatchState } from "../jobs/types.js";

/** Watch request authority and explicit connection/recovery policy for the declared job. */
export interface UseJobRunOptions extends Omit<
  JobWatchOptions,
  "runId" | "expectedIdentity" | "identityKey" | "applicationId" | "protocolVersion"
> {
  readonly runId?: string;
  readonly enabled?: boolean;
  readonly autoConnect?: boolean;
  readonly expectedIdentity?: ExpectedClientIdentity;
}

/**
 * Frozen job run state plus connection, refetch and disposal controls.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export interface UseJobRunResult<Run = RunSnapshot> extends JobWatchState<Run> {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly refetch: () => Promise<void>;
}
