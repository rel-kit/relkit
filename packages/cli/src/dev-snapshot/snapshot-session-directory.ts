/**
 * Owns one exclusive candidate parent for a prepared development invocation.
 * Interrupted prior invocations retain their trees; only this Scope's mkdtemp
 * result is removed, after its later-acquired backend resources have retired.
 */
import { join } from "node:path";
import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { cleanupEffect, CliCleanup } from "../services/cleanup.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";

/**
 * Acquires an exclusive parent without deleting any existing generation.
 * @param projectRoot - Validated installed project root.
 * @returns A Scope-owned absolute directory; secondary release Causes enter the ledger.
 */
export const acquireSnapshotSessionDirectory = Effect.fn("DevSnapshot.sessionDirectory")(
  function* (projectRoot: string) {
    const files = yield* CliFileSystem;
    const cleanup = yield* CliCleanup;
    const parent = join(projectRoot, ".relkit", "dev", "sessions");
    yield* files.mkdir(parent);
    return yield* Effect.acquireRelease(files.stage(join(parent, "dev-session-")), (directory) =>
      cleanupEffect("dev.snapshot.session-directory.release", files.remove(directory)).pipe(
        Effect.provideService(CliCleanup, cleanup),
      ),
    );
  },
  (effect) => observeCli("dev.snapshot.session-directory", effect),
);
