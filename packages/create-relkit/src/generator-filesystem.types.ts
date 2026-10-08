import type { Effect } from "effect";
import type { GeneratorIoError } from "./generator-errors.js";

/** Native entry classification without following symlinks. */
export type GeneratorEntryKind = "file" | "directory" | "symlink" | "other";

/** Filesystem metadata needed for safe mutation and mode restoration. */
export interface GeneratorFileMetadata {
  readonly kind: GeneratorEntryKind;
  readonly mode: number;
}

/** A directory entry read without following symlinks. */
export interface GeneratorDirectoryEntry {
  readonly name: string;
  readonly kind: GeneratorEntryKind;
}

/** Explicit native filesystem authority for generator workflows. */
export interface GeneratorFileSystemService {
  /**
   * Reads UTF-8 file contents with interruptible native read authority.
   * @param path - Path inside the current project or owned resource.
   * @returns File contents, or a typed native read failure.
   */
  readonly readText: (path: string) => Effect.Effect<string, GeneratorIoError>;
  /**
   * Reads original file bytes for exact rollback snapshots.
   * @param path - Path inside the current project or owned resource.
   * @returns File bytes, or a typed native read failure.
   */
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, GeneratorIoError>;
  /**
   * Checks native accessibility without granting file mutation.
   * @param path - Path inside the current project or owned resource.
   * @returns Completion when the destination is accessible.
   */
  readonly access: (path: string) => Effect.Effect<void, GeneratorIoError>;
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
  readonly entries: (
    path: string,
  ) => Effect.Effect<readonly GeneratorDirectoryEntry[], GeneratorIoError>;
  /**
   * Writes complete content and waits for physical native settlement.
   * @param path - Path inside the current project or owned resource.
   * @param content - Complete bytes or text planned for the destination.
   * @param options - Explicit options retaining existing defaults.
   * @returns Completion after native bytes physically settle, before rollback can run.
   */
  readonly write: (
    path: string,
    content: string | Uint8Array,
    options?: { readonly mode?: number; readonly flag?: "wx" },
  ) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Creates owned directories and waits for physical native settlement.
   * @param path - Path inside the current project or owned resource.
   * @param options - Explicit options retaining existing defaults.
   * @returns Completion after native directory creation physically settles.
   */
  readonly mkdir: (
    path: string,
    options?: { readonly recursive?: boolean; readonly mode?: number },
  ) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Acquires a unique staging directory from its literal prefix.
   * @param prefix - Literal sibling-stage prefix owned by this invocation.
   * @returns The owned staging path after creation settles.
   */
  readonly temporaryDirectory: (prefix: string) => Effect.Effect<string, GeneratorIoError>;
  /**
   * Atomically moves an owned native path and waits for settlement.
   * @param from - Owned source path.
   * @param to - Validated destination path.
   * @returns Completion after the atomic native handoff settles.
   */
  readonly rename: (from: string, to: string) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Removes an owned native path with explicit recursive and force policy.
   * @param path - Path inside the current project or owned resource.
   * @param options - Explicit options retaining existing defaults.
   * @returns Completion after owned path removal settles.
   */
  readonly remove: (
    path: string,
    options?: { readonly recursive?: boolean; readonly force?: boolean },
  ) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Removes an owned directory only when it is empty.
   * @param path - Path inside the current project or owned resource.
   * @returns Completion after removing an owned empty directory.
   */
  readonly removeDirectory: (path: string) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Restores or sets native permission bits after content settlement.
   * @param path - Path inside the current project or owned resource.
   * @param mode - Optional restored or generated permission mode.
   * @returns Completion after native permission restoration settles.
   */
  readonly chmod: (path: string, mode: number) => Effect.Effect<void, GeneratorIoError>;
  /**
   * Enumerates sorted source paths with a declaration-owned glob pattern.
   * @param root - Absolute project or owned resource root.
   * @param pattern - Declaration-owned glob or ignore pattern.
   * @returns Sorted source-relative paths matching the declaration pattern.
   */
  readonly glob: (
    root: string,
    pattern: string,
  ) => Effect.Effect<readonly string[], GeneratorIoError>;
}
