import { join } from "node:path";
import { Effect } from "effect";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { observeCli } from "../cli-runtime.js";

/**
 * Checks writable runtime roots with one explicitly owned marker per directory.
 * @param root - Project root.
 * @returns A report after every marker's cleanup; genuine secondary failures remain in CliCleanup.
 */
export const checkRootsEffect = Effect.fn("Doctor.roots")(
  function* (root: string) {
    const files = yield* CliFileSystem;
    const cleanup = yield* CliCleanup;
    const paths = [
      ".relkit",
      ".relkit/generated",
      ".relkit/build",
      ".relkit/state",
      ".relkit/observability",
    ].map((path) => join(root, path));
    const results = yield* Effect.forEach(paths, (path) =>
      Effect.scoped(
        Effect.gen(function* () {
          const marker = yield* Effect.acquireRelease(
            Effect.sync(() => join(path, `.doctor-${crypto.randomUUID()}`)),
            (marker) =>
              cleanupEffect("doctor.marker.release", files.remove(marker)).pipe(
                Effect.provideService(CliCleanup, cleanup),
              ),
          );
          yield* files.mkdir(path);
          yield* files.writeText(marker, "");
        }),
      ).pipe(
        Effect.as(undefined),
        Effect.catchTag("CliAdapterError", () => Effect.succeed(path)),
      ),
    );
    const failures = results.filter((path) => path !== undefined);
    return {
      name: "relkit-roots",
      ok: failures.length === 0,
      message:
        failures.length === 0
          ? ".relkit roots are writable."
          : "One or more .relkit roots are not writable.",
      ...(failures.length === 0 ? {} : { details: { failed: failures } }),
    };
  },
  (effect) => observeCli("doctor.roots", effect),
);
