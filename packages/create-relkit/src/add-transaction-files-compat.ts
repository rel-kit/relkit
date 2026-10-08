import { type ScaffoldFileOperation } from "./add-types.js";

import { runGeneratorPromise } from "./generator-runtime.js";

import type { FileSnapshot } from "./add-transaction-files.types.js";

/**
 * Preserves the existing snapshot Promise API.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @param includeLock - Whether install may mutate either Bun lock format.
 * @returns Snapshots of original bytes/modes for touched files and required Bun lockfiles.
 */
export function snapshotFiles(
  root: string,
  operations: readonly ScaffoldFileOperation[],
  includeLock: boolean,
): Promise<readonly FileSnapshot[]> {
  return runGeneratorPromise(snapshotFilesEffect(root, operations, includeLock));
}

/**
 * Preserves the existing preflight Promise API.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @returns Completion after the existing contract has been applied.
 */
export function validateOperationActions(
  root: string,
  operations: readonly ScaffoldFileOperation[],
): Promise<void> {
  return runGeneratorPromise(validateOperationActionsEffect(root, operations));
}

/**
 * Preserves the existing ordered file-write Promise API.
 * @param root - Absolute project or owned resource root.
 * @param operations - Ordered planned create/update file operations.
 * @param createdDirectories - Directories owned by this transaction.
 * @returns Completion after the existing contract has been applied.
 */
export function applyFileOperations(
  root: string,
  operations: readonly ScaffoldFileOperation[],
  createdDirectories: Set<string>,
): Promise<void> {
  return runGeneratorPromise(applyFileOperationsEffect(root, operations, createdDirectories));
}

/**
 * Preserves the existing byte-and-mode restoration Promise API.
 * @param snapshots - Pre-mutation bytes and permission snapshots.
 * @param createdDirectories - Directories owned by this transaction.
 * @returns Completion after the existing contract has been applied.
 */
export function restoreFiles(
  snapshots: readonly FileSnapshot[],
  createdDirectories: ReadonlySet<string>,
): Promise<void> {
  return runGeneratorPromise(restoreFilesEffect(snapshots, createdDirectories));
}

import {
  snapshotFilesEffect,
  validateOperationActionsEffect,
  applyFileOperationsEffect,
  restoreFilesEffect,
} from "./add-transaction-files.js";
