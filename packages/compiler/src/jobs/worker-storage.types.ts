import type { Effect } from "effect";
import type { ArtifactWriteResult } from "../generated-artifacts.js";
import type { JobWorkerStorageError } from "./worker-storage.js";

/** Required filesystem authority for worker preflight and atomic artifact writes. */
export interface JobWorkerStorageOperations {
  /**
   * Reads an artifact.
   * @param path - Full filesystem path.
   * @returns A lazy effect yielding text or undefined for a missing file, with typed I/O failures.
   */
  readonly read: (path: string) => Effect.Effect<string | undefined, JobWorkerStorageError>;

  /**
   * Writes an artifact through atomic replacement.
   * @param path - Full filesystem path.
   * @param content - Canonical UTF-8 bytes.
   * @returns A lazy effect yielding a write report, with typed I/O failures.
   * @remarks Completion includes temporary-file cleanup, even during interruption.
   */
  readonly write: (
    path: string,
    content: string,
  ) => Effect.Effect<ArtifactWriteResult, JobWorkerStorageError>;
}
