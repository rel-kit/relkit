/**
 * Watches a project tree without descending into dependencies or outputs. Bun's recursive watcher
 * on Linux holds one descriptor per directory, so a recursive watch on a project root walks
 * `node_modules` and exhausts the process's descriptors (EMFILE) before the first compile; macOS
 * watches the tree through one FSEvents stream and never showed it.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import type { SourceWatchOperations } from "../services/source-watch.types.js";

/** Top-level directories a project watch never descends into. */
export const UNWATCHED_PROJECT_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".relkit",
  ".next",
  ".turbo",
  "dist",
]);

/**
 * Lists the top-level directories of a root that a project watch descends into.
 * @param root - Project root.
 * @returns Directory names, or undefined when the root cannot be listed.
 */
export function watchedProjectDirectories(root: string): readonly string[] | undefined {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !UNWATCHED_PROJECT_DIRECTORIES.has(entry.name) &&
          !/^\.relkit-scaffold-/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return undefined;
  }
}

/**
 * Watches the root shallowly and each admitted top-level directory recursively; filenames reach
 * `change` relative to the root, as one recursive watch would report them. A root that cannot
 * be listed falls back to one recursive watch.
 * @param watches - Native watcher authority.
 * @param root - Project root.
 * @param change - Root-relative filename callback.
 * @param failure - Native error callback.
 * @returns One stop that closes every watcher opened here.
 */
export const watchProjectTreeEffect = Effect.fn("Dev.watchTree")(function* (
  watches: SourceWatchOperations,
  root: string,
  change: (filename: string) => void,
  failure: (reason: unknown) => void,
) {
  const directories = watchedProjectDirectories(root);
  if (directories === undefined) return yield* watches.watch(root, true, change, failure);
  const stops = [yield* watches.watch(root, false, change, failure)];
  for (const directory of directories)
    stops.push(
      yield* watches.watch(
        join(root, directory),
        true,
        (filename) => change(`${directory}/${filename.replaceAll("\\", "/")}`),
        failure,
      ),
    );
  return () => {
    for (const stop of stops) stop();
  };
});
