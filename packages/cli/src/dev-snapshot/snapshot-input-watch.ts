/** Watches authored trees and exact installed input/query directories without walking unrelated dependencies. */
import { readdirSync, realpathSync, statSync, watch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isSnapshotEpochPathRelevant } from "./snapshot-epoch-path.js";
import type { SnapshotMember } from "./snapshot.types.js";

const RESOLUTION_PATH =
  /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_@+.,():=\[\]-]+(?:\/[A-Za-z0-9_@+.,():=\[\]-]+)*$/;

/**
 * Opens every witness before hashing or authoritative inventory validation begins.
 * Parent observation covers replacement and negative resolution paths; the first
 * change invalidates the entire prepared epoch and transfers edits to safe compilation.
 */
export function watchSnapshotInputs(
  root: string,
  members: readonly SnapshotMember[],
  observations: unknown,
  changed: () => void,
  failed: (cause: unknown) => void,
  open: (
    path: string,
    options: { recursive: boolean },
    listener: (event: "rename" | "change", filename: string | null) => void,
  ) => FSWatcher = watch,
): () => void {
  const watchers: FSWatcher[] = [];
  const physicalRoot = realpathSync(root);
  const opened = new Set<string>();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch (cause) {
        errors.push(cause);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Snapshot input watch release failed");
  };
  const acquire = (path: string, recursive: boolean) => {
    const physical = realpathSync(path);
    const local = relative(physicalRoot, physical);
    if (local === ".." || local.startsWith("../") || isAbsolute(local))
      throw new Error("Snapshot input watch escaped its project");
    if (opened.has(physical)) return;
    const prefix = relative(root, path).replaceAll("\\", "/");
    const watcher = open(path, { recursive }, (_event, filename) => {
      const input =
        filename === null ? undefined : [prefix, filename.toString()].filter(Boolean).join("/");
      if (input === undefined || isSnapshotEpochPathRelevant(input)) changed();
    });
    watchers.push(watcher);
    opened.add(physical);
    watcher.on("error", failed);
  };
  try {
    // Root observation starts before enumeration, including absent top-level inputs.
    acquire(root, false);
    const entries = readdirSync(root, { withFileTypes: true });
    if (entries.length > 20_000)
      throw new Error("Snapshot input watch inventory exceeded its bound");
    for (const entry of entries)
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        isSnapshotEpochPathRelevant(entry.name)
      )
        acquire(join(root, entry.name), true);
    const directories = installedDirectories(members, observations);
    for (const directory of directories) {
      const path = join(root, directory);
      if (isDirectory(path)) acquire(path, false);
    }
    return close;
  } catch (primary) {
    try {
      close();
    } catch (secondary) {
      throw new AggregateError([primary, secondary], "Snapshot input watch acquisition failed");
    }
    throw primary;
  }
}

/** Includes all existing ancestors, so creating an absent resolution subtree invalidates reuse. */
function installedDirectories(
  members: readonly SnapshotMember[],
  observations: unknown,
): readonly string[] {
  if (!Array.isArray(observations) || observations.length > 50_000 || members.length > 20_000)
    throw new Error("Invalid snapshot input watch inventory");
  const directories = new Set<string>();
  const add = (value: unknown, includeSelf: boolean) => {
    if (
      typeof value !== "string" ||
      value.length > 1024 ||
      (value !== "." && !RESOLUTION_PATH.test(value))
    )
      throw new Error("Invalid snapshot input watch path");
    let path = includeSelf ? value : dirname(value);
    while (path === "node_modules" || path.startsWith("node_modules/")) {
      directories.add(path);
      if (directories.size > 20_000) throw new Error("Snapshot input watch exceeded its bound");
      path = dirname(path);
    }
  };
  for (const member of members) add(member.path, false);
  for (const observation of observations) {
    if (observation === null || typeof observation !== "object" || !("path" in observation))
      throw new Error("Invalid snapshot input watch query");
    add(observation.path, true);
  }
  return [...directories].sort(
    (left, right) => left.length - right.length || left.localeCompare(right),
  );
}

/** Only genuine absence is skipped; permission/native failures close the entire provisional watch. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      ["ENOENT", "ENOTDIR"].includes(String(cause.code))
    )
      return false;
    throw cause;
  }
}
