import type { FileHandle } from "node:fs/promises";

/** Native exclusive file authority, restricted to writing and closing the acquired handle. */
export interface ExclusiveFileNative {
  /**
   * Creates a new file without replacing an existing path.
   * @param path - Owner-selected temporary destination.
   * @param mode - Permission bits applied during exclusive creation.
   * @returns The owned handle; collision fails before ownership exists.
   */
  readonly open: (path: string, mode: number) => Promise<Pick<FileHandle, "writeFile" | "close">>;
  /**
   * Removes only a path whose exclusive open previously succeeded.
   * @param path - Acquired temporary destination after failed writing or close.
   * @returns Native rollback settlement.
   */
  readonly remove: (path: string) => Promise<void>;
}
