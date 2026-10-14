/** Pure migration path mapping and byte identities, independent of runtime resources. */
import { createHash } from "node:crypto";
import type { MigrationMove, MigrationFile } from "./layout.types.js";

/**
 * Maps only complete selected service roots, preserving deeper service-named folders.
 * @param path - Contained project-relative path.
 * @param moves - Deterministic service moves.
 * @returns Candidate physical path.
 */
export function movedPath(path: string, moves: readonly MigrationMove[]): string {
  const move = moves.find(({ from }) => path === from || path.startsWith(`${from}/`));
  return move === undefined ? path : move.to + path.slice(move.from.length);
}

/**
 * Identifies exact file bytes for concurrent-edit and recovery guards.
 * @param bytes - Native bytes.
 * @returns SHA-256 without source contents.
 */
export function fileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Captures one file's complete recoverable bytes and permissions.
 * @param path - Contained relative path.
 * @param bytes - Native bytes, including binary service assets.
 * @param mode - Original permission bits.
 * @returns Snapshot suitable for restricted local storage.
 */
export function migrationFile(path: string, bytes: Uint8Array, mode: number): MigrationFile {
  return {
    path,
    bytes: Buffer.from(bytes).toString("base64"),
    mode: mode & 0o7777,
    hash: fileHash(bytes),
  };
}
