import type { FileHandle } from "node:fs/promises";
import { Effect } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import { SEGMENT_DIRECTORIES } from "./segment-files-core.js";
import type { SegmentDirectory, SegmentFile } from "./segment-files.types.js";
import {
  ensureDirectoryEffect,
  ensureSegmentRootEffect,
  repairSegmentsEffect,
  listSegmentsEffect,
  appendLineEffect,
  writeAtomicEffect,
  syncDirectoryEffect,
  segmentDirectoryForEffect,
  type SegmentFileError,
} from "./segment-files-effect.js";
export { SEGMENT_DIRECTORIES };
export type { SegmentDirectory, SegmentFile } from "./segment-files.types.js";
export {
  SegmentFileError,
  ensureDirectoryEffect,
  ensureSegmentRootEffect,
  repairSegmentsEffect,
  listSegmentsEffect,
  appendLineEffect,
  writeAtomicEffect,
  syncDirectoryEffect,
  segmentDirectoryForEffect,
} from "./segment-files-effect.js";
function legacy(error: SegmentFileError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
function run<A>(effect: Effect.Effect<A, SegmentFileError>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.mapError(legacy)));
}
/**
 * Creates a private directory or checks an existing one without following links.
 * @param path - Directory path.
 * @returns Completion after the directory is safe.
 * @throws {Error} If the path is not a directory or IO fails.
 * @example
 * await ensureDirectory(root);
 */
export function ensureDirectory(path: string): Promise<void> {
  return run(ensureDirectoryEffect(path));
}
/**
 * Resolves and creates the bounded observability storage root.
 * @param requestedRoot - Optional configured root path.
 * @returns The absolute root path.
 * @throws {TypeError} If the root is empty or too broad.
 * @example
 * const root = await ensureSegmentRoot("/tmp/records");
 */
export function ensureSegmentRoot(requestedRoot?: string): Promise<string> {
  return run(ensureSegmentRootEffect(requestedRoot));
}
/**
 * Repairs malformed or partially written segment tails.
 * @param root - Segment root directory.
 * @param policy - Optional redaction policy.
 * @returns Completion after every signal directory is scanned.
 * @throws {Error} If repair or filesystem IO fails.
 * @example
 * await repairSegments(root);
 */
export function repairSegments(root: string, policy?: RedactionPolicy): Promise<void> {
  return run(repairSegmentsEffect(root, policy));
}
/**
 * Lists valid segment files and their record counts.
 * @param directory - One day directory.
 * @returns Sorted segment metadata.
 * @throws {Error} If directory or file IO fails.
 * @example
 * const files = await listSegments(dayRoot);
 */
export function listSegments(directory: string): Promise<SegmentFile[]> {
  return run(listSegmentsEffect(directory));
}
/**
 * Appends one NDJSON line to an owned handle.
 * @param handle - Open segment handle.
 * @param line - Complete line including its newline.
 * @returns Completion after the write.
 * @throws {Error} If writing fails.
 * @example
 * await appendLine(handle, "{}\\n");
 */
export function appendLine(handle: FileHandle, line: string): Promise<void> {
  return run(appendLineEffect(handle, line));
}
/**
 * Replaces a file through a synced temporary file and directory rename.
 * @param path - Destination path.
 * @param value - Complete file contents.
 * @returns Completion after durable replacement.
 * @throws {Error} If writing, sync, or rename fails.
 * @example
 * await writeAtomic(path, "{}\\n");
 */
export function writeAtomic(path: string, value: string): Promise<void> {
  return run(writeAtomicEffect(path, value));
}
/**
 * Syncs a directory after a durable rename.
 * @param path - Directory path.
 * @returns Completion after sync and handle close.
 * @throws {Error} If open or sync fails.
 * @example
 * await syncDirectory(root);
 */
export function syncDirectory(path: string): Promise<void> {
  return run(syncDirectoryEffect(path));
}
/**
 * Chooses the storage directory for a model signal.
 * @param signal - Candidate signal.
 * @returns A known directory or undefined.
 * @example
 * const directory = segmentDirectoryFor("log");
 */
export function segmentDirectoryFor(signal: unknown): SegmentDirectory | undefined {
  return Effect.runSync(segmentDirectoryForEffect(signal));
}
