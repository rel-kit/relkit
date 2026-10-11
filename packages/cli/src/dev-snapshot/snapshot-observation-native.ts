/**
 * Replays finite compiler resolution probes through the snapshot's original root.
 * Missing files are data, while escaped parents, root replacement and other native
 * faults reject reuse. Directory membership uses TypeScript's sorted child-directory
 * semantics and never treats an escaped link as an eligible installed dependency.
 */
import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Schema } from "effect";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { assertSnapshotRoot } from "./snapshot-file-bytes.js";
import { SnapshotResolutionPath } from "./snapshot.schemas.js";
import type { SnapshotReadRoot, TypecheckObservation } from "./snapshot-files.types.js";

/**
 * Checks every query and its nearest existing physical parent before observing it.
 * @param root - Original acquired project authority.
 * @param queries - Bounded portable resolution witness batch.
 * @returns Current observations in caller order; native exceptions cross one Effect adapter.
 */
export function readSnapshotObservations(
  root: SnapshotReadRoot,
  queries: readonly TypecheckObservation[],
): readonly TypecheckObservation[] {
  assertSnapshotRoot(root);
  const parents = new Set(
    queries.map((query) => {
      if (query.path !== "." && !Schema.is(SnapshotResolutionPath)(query.path)) throw rejected();
      const path = join(root.path, query.path);
      return query.kind === "fileExists" ? dirname(path) : path;
    }),
  );
  for (const parent of parents) assertParent(root, parent);
  const observations = queries.map((query) => {
    const path = join(root.path, query.path);
    if (query.kind === "directories" || query.kind === "entries") {
      const entries =
        query.kind === "directories" ? childDirectories(root, path) : directoryEntries(path);
      return { ...query, entries };
    }
    let entry = nativeStat(path, "entry");
    if (entry?.isSymbolicLink()) {
      parents.add(path);
      assertParent(root, path);
      entry = nativeStat(path);
    }
    const exists =
      query.kind === "fileExists" ? entry?.isFile() === true : entry?.isDirectory() === true;
    return { ...query, exists };
  });
  for (const parent of parents) assertParent(root, parent);
  assertSnapshotRoot(root);
  return observations;
}

/** Returns every direct native basename, or no entries for a missing/non-directory path. */
function directoryEntries(path: string): string[] {
  if (nativeStat(path)?.isDirectory() !== true) return [];
  return readdirSync(path).sort();
}

/**
 * Returns sorted child directories, matching TypeScript's native enumeration.
 * @param root - Project containment witness retained through symlink inspection.
 * @param path - Already-contained directory query.
 * @returns Sorted basenames or an empty list for a missing/non-directory query.
 */
function childDirectories(root: SnapshotReadRoot, path: string): string[] {
  if (nativeStat(path)?.isDirectory() !== true) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) directories.push(entry.name);
    if (entry.isSymbolicLink() && nativeStat(child)?.isDirectory() === true) {
      assertParent(root, child);
      directories.push(entry.name);
    }
  }
  return directories.sort();
}

/**
 * Resolves a missing query through its nearest existing parent without blessing an escape.
 * @param root - Original physical project root.
 * @param path - Portable query joined under the logical root.
 * @returns Completion or expected rejection before resolution metadata is accepted.
 */
function assertParent(root: SnapshotReadRoot, path: string): void {
  let parent = path;
  while (nativeStat(parent) === undefined) parent = dirname(parent);
  const local = relative(root.physical, realpathSync(parent));
  if (local === ".." || local.startsWith("../")) throw rejected();
}

/**
 * Distinguishes genuine absence from permission and native adapter failures.
 * @param path - Contained native query path.
 * @param mode - Entry metadata detects links; target metadata follows native TypeScript semantics.
 * @returns Native metadata or absence; unmatched errors retain their original cause.
 */
function nativeStat(path: string, mode: "entry" | "target" = "target") {
  try {
    if (mode === "entry") return lstatSync(path);
    return statSync(path);
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      ["ENOENT", "ENOTDIR"].includes(String(cause.code))
    )
      return undefined;
    throw cause;
  }
}

/** Constructs a safe native containment rejection without query content.
 * @returns Expected ineligibility handled by the snapshot fallback policy.
 */
function rejected() {
  return new DevSnapshotRejected({ reason: "ineligible", operation: "typecheck.containment" });
}
