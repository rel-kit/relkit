/**
 * Defines finite preparation inputs and accepted outputs. Probe policy is supplied
 * by the generated workflow; no environment values or native staging paths enter
 * the persisted receipt, and preparation never starts a listener or inspector.
 */
import type { Effect } from "effect";
import type { ApplicationGraph } from "@relkit/graph";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { SnapshotTools, DevSnapshot } from "./snapshot.types.js";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { CliAdapterError } from "../cli-errors.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { SnapshotCompilationOperations } from "./snapshot-compilation.types.js";
import type { SnapshotDependencyOperations } from "./snapshot-dependencies.types.js";
import type {
  SnapshotPublicationNativeOperations,
  SnapshotPublicationOperations,
} from "./snapshot-publication.types.js";
import type { SnapshotEpochOperations } from "./snapshot-epoch.types.js";
import type { FileSystemCapabilities } from "../services/filesystem.types.js";

/** Generated examples use their normal hello route; empty examples require live graph proof. */
export interface SnapshotPreparationRequest {
  readonly projectRoot: string;
  readonly tools: SnapshotTools;
  readonly probe: "generated-hello" | "graph" | "auto";
}

/** Snapshot content address is the only persistent generation identity returned. */
export interface PreparedDevSnapshot {
  readonly generation: string;
  readonly graphHash: string;
}

/** One decoded build cohort, before executable authority is granted by publication. */
export interface SnapshotBuildCohort {
  readonly graph: ApplicationGraph;
  readonly activation: RuntimeActivationFingerprint;
  readonly routeImports: DevSnapshot["routeImports"];
  readonly readiness: DevSnapshot["readiness"];
}

/** Preparation composes scoped checking, bundle inventory, byte guards and atomic publication. */
export interface SnapshotPreparationOperations {
  readonly prepare: (
    request: SnapshotPreparationRequest,
  ) => Effect.Effect<
    PreparedDevSnapshot,
    DevSnapshotIoError | DevSnapshotRejected | CliAdapterError
  >;
}

/** Shared authorities captured once; every operation still supplies its own root/epoch. */
export interface SnapshotPreparationAuthorities {
  readonly files: SnapshotFileOperations;
  readonly compilation: SnapshotCompilationOperations;
  readonly dependencies: SnapshotDependencyOperations;
  readonly publication: SnapshotPublicationOperations;
  readonly native: SnapshotPublicationNativeOperations;
  readonly epochs: SnapshotEpochOperations;
  readonly writes: FileSystemCapabilities;
}
