import type { Effect } from "effect";
import type { Stats } from "node:fs";
import type { CliAdapterError } from "../cli-errors.js";

/** Project file authority; every mutation settles before its owner can roll back. */
export interface FileSystemCapabilities {
  /**
   * Reads authored UTF-8 text with fiber cancellation.
   * @param path - Accepted native file path.
   * @returns Text or the original read failure in the typed adapter channel.
   */
  readonly readText: (path: string) => Effect.Effect<string, CliAdapterError>;
  /**
   * Replaces UTF-8 content and waits for native completion before interruption.
   * @param path - Accepted destination.
   * @param text - Complete replacement bytes.
   * @returns Completion after the write settles.
   */
  readonly writeText: (path: string, text: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Creates an exclusively owned file with explicit permissions.
   * @param path - New path; existing files fail rather than being overwritten.
   * @param text - UTF-8 content.
   * @param mode - Native permission bits.
   * @returns Completion after the write settles.
   */
  readonly writeExclusive: (
    path: string,
    text: string,
    mode: number,
  ) => Effect.Effect<void, CliAdapterError>;
  /**
   * Applies permissions after an owned atomic publication.
   * @param path - Accepted destination file.
   * @param mode - Native permission bits.
   * @returns Completion or a typed native failure.
   */
  readonly chmod: (path: string, mode: number) => Effect.Effect<void, CliAdapterError>;
  /**
   * Creates the accepted directory and missing parents.
   * @param path - Invocation-owned destination.
   * @returns Completion after recursive native creation.
   */
  readonly mkdir: (path: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Removes an owned file/tree without failing for absence.
   * @param path - Owner-selected cleanup destination.
   * @returns Completion after recursive forced removal settles.
   */
  readonly remove: (path: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Copies a complete artifact tree with the established replacement policy.
   * @param source - Accepted artifact root.
   * @param target - Owned staging destination.
   * @returns Completion after recursive native copying.
   */
  readonly copy: (source: string, target: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Atomically moves a staged artifact or retained backup.
   * @param source - Existing owned path.
   * @param target - Publication or rollback destination.
   * @returns Completion before any rollback may start.
   */
  readonly rename: (source: string, target: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Creates an exclusive temporary artifact directory.
   * @param prefix - Parent path and native mkdtemp prefix.
   * @returns The newly owned absolute directory.
   */
  readonly stage: (prefix: string) => Effect.Effect<string, CliAdapterError>;
  /**
   * Creates a temporary directory-resolution link for bundling.
   * @param source - Existing module tree.
   * @param target - New owned link path.
   * @returns Completion after native link creation.
   */
  readonly symlink: (source: string, target: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Removes only the selected link/file; absence remains a typed failure.
   * @param path - Exact owned link path.
   * @returns Native unlink completion.
   */
  readonly unlink: (path: string) => Effect.Effect<void, CliAdapterError>;
  /**
   * Inspects native file metadata without changing contents.
   * @param path - Accepted file or directory.
   * @returns Native metadata or a typed inspection failure.
   */
  readonly stat: (path: string) => Effect.Effect<Stats, CliAdapterError>;
  /**
   * Performs the established synchronous existence probe.
   * @param path - Accepted candidate path.
   * @returns Whether the native path exists.
   */
  readonly exists: (path: string) => Effect.Effect<boolean>;
  /**
   * Collects authored files deterministically across compiler glob patterns.
   * @param root - Containing authored directory.
   * @param patterns - Compiler-owned include patterns.
   * @returns Sorted unique project-relative paths with portable separators.
   */
  readonly files: (
    root: string,
    patterns: readonly string[],
  ) => Effect.Effect<readonly string[], CliAdapterError>;
}
