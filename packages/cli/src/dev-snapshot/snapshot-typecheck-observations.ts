/**
 * Removes checker queries already proved by stronger consumed-file witnesses.
 * A complete regular-file hash proves that file and its ancestor directories exist;
 * a retained absent directory proves all queries below it remain absent. No negative
 * shadow-module query is omitted unless that containing absence is itself rechecked.
 */
import { posix } from "node:path";
import type { TypecheckInputWitness } from "@relkit/compiler";

/**
 * Selects the minimal query set implied by the complete consumed-read inventory.
 * @param witnesses - Original observations of one successful isolated check.
 * @returns Remaining exact queries; all consumed reads are verified independently.
 */
export function snapshotTypecheckObservations(witnesses: readonly TypecheckInputWitness[]) {
  const reads = new Set(
    witnesses.filter((witness) => witness.kind === "read").map((read) => read.path),
  );
  const directories = new Set<string>();
  for (const path of reads) {
    let parent = posix.dirname(path);
    while (!directories.has(parent)) {
      directories.add(parent);
      if (parent === ".") break;
      parent = posix.dirname(parent);
    }
  }
  const absent = new Set(
    witnesses
      .filter((witness) => witness.kind === "directoryExists" && !witness.exists)
      .map((query) => query.path),
  );
  const dependencyRoots = new Set(
    witnesses
      .filter(
        (witness) => witness.kind === "read" || (witness.kind !== "directories" && witness.exists),
      )
      .map((witness) => dependencyRoot(witness.path))
      .filter((path): path is string => path !== undefined),
  );
  return witnesses
    .filter((witness) => witness.kind !== "read")
    .filter((query) => {
      if (
        [...dependencyRoots].some(
          (root) => query.path === root || query.path.startsWith(`${root}/`),
        )
      )
        return false;
      if (query.kind === "directories") return true;
      if (query.exists)
        return !(query.kind === "fileExists" ? reads.has(query.path) : directories.has(query.path));
      let parent = posix.dirname(query.path);
      while (parent !== ".") {
        if (absent.has(parent)) return false;
        parent = posix.dirname(parent);
      }
      return true;
    });
}

/** Returns one installed package root while preserving root-level shadow probes. */
function dependencyRoot(path: string): string | undefined {
  const segments = path.split("/");
  if (segments[0] !== "node_modules" || segments.length < 2) return undefined;
  if (segments[1]?.startsWith("@"))
    return segments.length < 3 ? undefined : segments.slice(0, 3).join("/");
  return segments.slice(0, 2).join("/");
}
