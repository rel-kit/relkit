/**
 * Replaces many negative file probes with exact parent-directory inventories.
 * Preparation verifies every originally absent basename before persisting the
 * stronger compact witness; startup then needs one contained read per parent.
 */
import { posix } from "node:path";
import { Effect } from "effect";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotFileOperations, TypecheckObservation } from "./snapshot-files.types.js";

/** Compacts negative file probes without accepting state that diverged after checking. */
export const compactTypecheckObservations = Effect.fn("DevSnapshot.compactTypecheckQueries")(
  function* (
    files: SnapshotFileOperations,
    root: string,
    observations: readonly TypecheckObservation[],
  ) {
    const absentByParent = new Map<string, Set<string>>();
    const retained: TypecheckObservation[] = [];
    for (const observation of observations) {
      if (observation.kind !== "fileExists" || observation.exists) {
        retained.push(observation);
        continue;
      }
      const parent = posix.dirname(observation.path);
      const names = absentByParent.get(parent) ?? new Set<string>();
      names.add(posix.basename(observation.path));
      absentByParent.set(parent, names);
    }
    const planned = [...absentByParent.keys()]
      .sort()
      .map((path) => ({ kind: "entries" as const, path, entries: [] }));
    const current = yield* files.observations(root, planned);
    for (const observation of current) {
      if (observation.kind !== "entries") return yield* rejected();
      const absent = absentByParent.get(observation.path);
      if (absent === undefined || observation.entries.some((entry) => absent.has(entry)))
        return yield* rejected();
    }
    return [...retained, ...current].sort((left, right) =>
      `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`),
    );
  },
);

/** Rejects resolution drift between the successful check and receipt capture. */
function rejected() {
  return new DevSnapshotRejected({ reason: "stale", operation: "typecheck.changed" });
}
