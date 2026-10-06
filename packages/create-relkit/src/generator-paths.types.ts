import type { Effect } from "effect";
import type { GeneratorIoError } from "./generator-errors.js";
import type { GeneratorFileMetadata } from "./generator-filesystem.types.js";

/** Read-only native path authority that preserves existing synchronous validation APIs. */
export interface GeneratorPathsService {
  /**
   * Reads kind and permissions without dereferencing symlinks.
   * @param path - Path inside the current project or owned resource.
   * @returns Entry kind and mode, undefined when absent; symlinks are not followed.
   */
  readonly metadata: (
    path: string,
  ) => Effect.Effect<GeneratorFileMetadata | undefined, GeneratorIoError>;
  /**
   * Reads directory entries for deterministic declaration traversal.
   * @param path - Path inside the current project or owned resource.
   * @returns Directory entries without following symlinks.
   */
  readonly entries: (path: string) => Effect.Effect<readonly string[], GeneratorIoError>;
  /**
   * Canonicalizes an existing path for safe destination validation.
   * @param path - Path inside the current project or owned resource.
   * @returns Canonical existing path, or a typed native failure.
   */
  readonly realpath: (path: string) => Effect.Effect<string, GeneratorIoError>;
  /**
   * Reads the composition root's native current directory.
   * @returns Current native working directory.
   */
  readonly cwd: () => Effect.Effect<string>;
  /**
   * Reads the user's native home directory for destination safety.
   * @returns Native user home directory.
   */
  readonly home: () => Effect.Effect<string>;
  /**
   * Reads the native temporary root for destination safety.
   * @returns Native temporary directory root.
   */
  readonly temporaryRoot: () => Effect.Effect<string>;
}
