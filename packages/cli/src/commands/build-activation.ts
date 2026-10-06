import { Effect } from "effect";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { Layer } from "effect";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";

/**
 * Replaces a build cohort while keeping the previous directory until commit succeeds.
 * @param stage - Owned complete staging directory.
 * @param buildDirectory - Active cohort path.
 * @returns A lazy atomic rename transaction; cancellation waits until rollback or commit completes.
 */
export const activateBuildEffect = Effect.fn("Project.activateBuild")(
  function* (stage: string, buildDirectory: string) {
    const files = yield* CliFileSystem;
    const backup = `${buildDirectory}.previous-${process.pid}-${crypto.randomUUID()}`;
    const moved = yield* files.rename(buildDirectory, backup).pipe(
      Effect.as(true),
      Effect.catchTag("CliAdapterError", (error) =>
        isMissing(error) ? Effect.succeed(false) : Effect.fail(error),
      ),
    );
    const published = yield* files.rename(stage, buildDirectory).pipe(Effect.result);
    if (published._tag === "Failure") {
      if (moved) {
        yield* cleanupEffect("build.rollback.remove", files.remove(buildDirectory));
        yield* cleanupEffect("build.rollback.restore", files.rename(backup, buildDirectory));
      }
      return yield* Effect.fail(published.failure);
    }
    if (moved) yield* cleanupEffect("build.previous.remove", files.remove(backup));
  },
  (effect, _stage: string, _buildDirectory: string) =>
    observeCli("build.activate", effect.pipe(Effect.uninterruptible)),
);

/**
 * Publishes a staged build at the established Promise edge.
 * @param stage - Complete staging directory.
 * @param buildDirectory - Destination whose previous cohort is retained on failure.
 * @returns A Promise completing after activation or restoration.
 */
export function activateBuild(stage: string, buildDirectory: string): Promise<void> {
  return runCliEffect(
    activateBuildEffect(stage, buildDirectory),
    Layer.merge(fileSystemLayer, cleanupLayer),
  );
}

/**
 * Permits initial activation only when the old cohort is absent.
 * @param error - Typed adapter or original filesystem rejection.
 * @returns Whether the native path was missing.
 */
function isMissing(error: unknown): boolean {
  const cause = cliOriginalError(error);
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
