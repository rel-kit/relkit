/**
 * Adapts bounded file reads and project enumeration to Effect ownership. Reads
 * use an owned no-follow descriptor, verify containment and reject partial or
 * concurrently resized content. Runtime state and environment files never enter
 * project fingerprints; mutable links make a project ineligible for reuse.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotPath } from "./snapshot.schemas.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import type { SnapshotFileOperations, SnapshotReadRoot } from "./snapshot-files.types.js";
import { snapshotFileReadOperations } from "./snapshot-file-reads.js";
import { snapshotObservations } from "./snapshot-observations.js";

/** Injectable file authority; acquisition itself does not read or execute a project. */
export class SnapshotFiles extends Context.Service<SnapshotFiles, SnapshotFileOperations>()(
  "relkit/DevSnapshot/Files",
  {
    make: Effect.sync(() => {
      const roots = new Map<string, SnapshotReadRoot>();
      return {
        ...snapshotFileReadOperations(roots),
        projectPaths,
        observations: (root, queries) => snapshotObservations(roots, root, queries),
      } satisfies SnapshotFileOperations;
    }),
  },
) {}

/** Supplies bounded native operations while preserving per-operation request roots. */
export const snapshotFilesLive = Layer.effect(SnapshotFiles, SnapshotFiles.make);

/**
 * Enumerates all files rather than descriptor conventions or timestamps.
 * @param root - Project root; source/helper/asset/config additions participate equally.
 * @returns Sorted complete project paths, or ineligibility for mutable/escaped links.
 */
const projectPaths = Effect.fn("DevSnapshot.Files.projectPaths")((root: string) =>
  observeExecution(
    "cli",
    "dev.snapshot.inventory",
    Effect.gen(function* () {
      const count = yield* Ref.make(0);
      return (yield* walkProject(root, "", count)).sort();
    }),
  ),
);

/**
 * Walks one project directory with bounded native enumeration.
 * @param root - Root whose state, dependencies and environment are excluded.
 * @param directory - Relative directory already proven contained by its parent.
 * @param count - Shared enumeration budget across every nested directory.
 * @returns All eligible input paths below this directory.
 */
const walkProject: (
  root: string,
  directory: string,
  count: Ref.Ref<number>,
) => Effect.Effect<string[], DevSnapshotIoError | DevSnapshotRejected> = Effect.fn(
  "DevSnapshot.Files.walk",
)(function* (root: string, directory: string, count: Ref.Ref<number>) {
  const entries = yield* native("inventory.read", () =>
    readdir(join(root, directory), { withFileTypes: true }),
  );
  const total = yield* Ref.updateAndGet(count, (value) => value + entries.length);
  if (total > 20_000) return yield* reject("inventory.bound");
  const paths = yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        if (
          ["node_modules", ".git", ".relkit", ".next"].includes(entry.name) ||
          entry.name === ".env" ||
          entry.name.startsWith(".env.")
        )
          return [];
        const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
        if (entry.isSymbolicLink() || !Schema.is(SnapshotPath)(path))
          return yield* reject("inventory.link-or-path");
        if (entry.isDirectory()) return yield* walkProject(root, path, count);
        if (!entry.isFile()) return yield* reject("inventory.non-file");
        return [path];
      }),
    // A recursive parallel traversal multiplies permits at each depth. File
    // hashing is parallel; directory enumeration keeps one global budget owner.
    { concurrency: 1 },
  );
  const flattened = paths.flat();
  if (flattened.length > 20_000) return yield* reject("inventory.bound");
  return flattened;
});

/**
 * Converts a cancellable native operation once at the filesystem boundary.
 * @typeParam A - Native successful value, never an undecoded persisted contract.
 * @param operation - Safe fixed adapter label.
 * @param run - Lazy operation consuming cancellation when supported by Node.
 * @returns Native result or normalized typed I/O error.
 */
function native<A>(operation: string, run: (signal: AbortSignal) => Promise<A>) {
  return ownedNativePromise(operation, run).pipe(
    mapErrorCause(
      (cause) =>
        new DevSnapshotIoError({
          operation,
          cause: new Error("Snapshot file access failed", { cause }),
        }),
    ),
  );
}

/**
 * Rejects reuse without disclosing project bytes or environment values.
 * @param operation - Fixed rejection context.
 * @returns A typed ineligibility failure, distinct from defects and interruption.
 */
function reject(operation: string) {
  return Effect.fail(new DevSnapshotRejected({ reason: "ineligible", operation }));
}
