import { runGeneratorPromise } from "./generator-runtime.js";

import type { StageCleanupResult } from "./generate-files-utilities.types.js";
/**
 * Preserves staging cleanup's Promise API.
 * @param stage - Owned sibling staging directory, or undefined before acquisition.
 * @param destination - Absolute final project destination.
 * @returns The verified temporary-path cleanup disposition after the native attempt settles.
 */
export function cleanupStagedProject(
  stage: string | undefined,
  destination: string,
): Promise<StageCleanupResult> {
  return runGeneratorPromise(cleanupStagedProjectEffect(stage, destination));
}

/**
 * Preserves template preflight's Promise API.
 * @param path - Path inside the current project or owned resource.
 * @returns Completion after the existing contract has been applied.
 */
export function requireTemplate(path: string): Promise<void> {
  return runGeneratorPromise(requireTemplateEffect(path));
}

/**
 * Preserves required-file preflight's Promise API.
 * @param root - Absolute project or owned resource root.
 * @param paths - Relative paths checked in stable order.
 * @returns Completion after the existing contract has been applied.
 */
export function requireFiles(root: string, paths: readonly string[]): Promise<void> {
  return runGeneratorPromise(requireFilesEffect(root, paths));
}

/**
 * Preserves exact substitution's Promise API.
 * @param path - Path inside the current project or owned resource.
 * @param before - Unique template marker expected in the authored source.
 * @param after - Literal replacement for that unique marker.
 * @returns Completion after the existing contract has been applied.
 */
export function replaceOnce(path: string, before: string, after: string): Promise<void> {
  return runGeneratorPromise(replaceOnceEffect(path, before, after));
}

/**
 * Preserves example removal's Promise API.
 * @param root - Absolute project or owned resource root.
 * @returns Completion after the existing contract has been applied.
 */
export function removeExamples(root: string): Promise<void> {
  return runGeneratorPromise(removeExamplesEffect(root));
}

/**
 * Preserves deterministic file listing's Promise API.
 * @param root - Absolute project or owned resource root.
 * @param current - Directory currently traversed beneath the project root.
 * @returns Sorted project-relative file paths beneath the selected subtree.
 */
export function listProjectFiles(root: string, current = root): Promise<string[]> {
  return runGeneratorPromise(listProjectFilesEffect(root, current));
}

import {
  cleanupStagedProjectEffect,
  requireTemplateEffect,
  requireFilesEffect,
  replaceOnceEffect,
  removeExamplesEffect,
  listProjectFilesEffect,
} from "./generate-files-utilities.js";
