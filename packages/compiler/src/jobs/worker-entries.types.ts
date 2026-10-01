import type { ArtifactWriteResult } from "../generated-artifacts.js";

/** Filesystem root for compiler-owned immutable job artifacts. */
export interface JobWorkerWriteOptions {
  readonly buildDirectory: string;
}

/** Completed writes; all report arrays and the enclosing report are frozen. */
export interface JobWorkerWriteReport {
  readonly workers: readonly ArtifactWriteResult[];
  readonly routingManifests: readonly ArtifactWriteResult[];
  readonly changed: boolean;
}

/** Preflight result retained until every immutable path has been checked. */
export interface PendingWorker {
  readonly path: string;
  readonly content: string;
  readonly routing: string;
  readonly routingContent: string;
}
