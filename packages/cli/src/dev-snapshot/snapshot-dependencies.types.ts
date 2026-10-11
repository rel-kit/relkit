/**
 * Defines preparation's installed executable-content authority. Acquisition
 * captures file access only; each call receives its own project and completed
 * bundle inventory and returns portable identities without executing modules.
 */
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { FileSystemCapabilities } from "../services/filesystem.types.js";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotDependency } from "./snapshot.types.js";

/** Complete dependency closure capture borrowed by the preparation service. */
export interface SnapshotDependencyOperations {
  readonly capture: (
    root: string,
    metafile: Uint8Array,
    capsuleRoot?: string,
    writes?: FileSystemCapabilities,
  ) => Effect.Effect<
    readonly SnapshotDependency[],
    CliAdapterError | DevSnapshotIoError | DevSnapshotRejected
  >;
}
