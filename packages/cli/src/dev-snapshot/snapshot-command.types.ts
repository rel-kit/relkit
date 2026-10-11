/** Startup selection retains one validation result and the watch which bracketed its byte reads. */
import type { ValidatedDevSnapshot } from "./snapshot.types.js";
import type { Effect } from "effect";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotEpoch, SnapshotEpochToken } from "./snapshot-epoch.types.js";
import type { ProjectArgs } from "../commands/project-args.types.js";

/** No executable authority exists until this data-only selection succeeds. */
export interface PreparedDevSelection {
  readonly projectRoot: string;
  readonly snapshot: ValidatedDevSnapshot;
  readonly epoch: SnapshotEpoch;
  readonly token: SnapshotEpochToken;
  readonly options: ProjectArgs;
  readonly verification: Effect.Effect<void, DevSnapshotRejected | DevSnapshotIoError>;
}
