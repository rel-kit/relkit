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
  return witnesses
    .filter((witness) => witness.kind !== "read")
    .filter((query) => {
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
