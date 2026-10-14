/** Owns packed export smoke from manifest validation through outside-workspace fixture cleanup and native child termination. */
import { cp, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { exportNative } from "./pack-export-native.js";
import { exportInventory, exportTarballs } from "./pack-export-inventory.js";
import { verifyExportFixture } from "./pack-export-fixture.js";
import type { ExportCommand } from "./pack-export.types.js";

/** One export acceptance invocation captures command authority and owns its temporary fixture scope. */
class ExportSmoke extends Context.Service<ExportSmoke>()("relkit.scripts.ExportSmoke", {
  make: Effect.gen(function* () {
    const process = yield* ScaffoldProcess;
    return { run: () => observeExecution("testing", "exports.acceptance", main(process.run)) };
  }),
}) {}

/**
 * Builds the exact fixture without granting authority to unrelated SDKs or internal package paths.
 * @param run - Captured native command capability.
 * @returns Completion after every child/output and temporary directory has been released.
 */
const main = Effect.fn("ExportSmoke.acceptance")(function* (run: ExportCommand) {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const inventory = yield* exportInventory(repository);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* Effect.acquireRelease(
        exportNative("temporary", () => mkdtemp(join(tmpdir(), "relkit-export-smoke-"))),
        (root) =>
          exportNative("temporary.release", () => rm(root, { recursive: true, force: true })).pipe(
            Effect.orDie,
          ),
      );
      const artifactRoot = join(temporary, "artifacts");
      yield* exportNative("fixture.copy", () =>
        cp(join(repository, "tests/exports/fixture"), join(temporary, "fixture"), {
          recursive: true,
        }),
      );
      yield* exportNative("artifact.root", () => mkdir(artifactRoot));
      const tarballs = yield* exportTarballs(run, inventory, artifactRoot);
      yield* verifyExportFixture(run, temporary, repository, inventory, tarballs);
    }),
  );
});

const liveLayer = Layer.effect(ExportSmoke, ExportSmoke.make).pipe(
  Layer.provide(scaffoldProcessLayer),
);
await Effect.runPromise(
  Effect.flatMap(ExportSmoke, (service) => service.run()).pipe(Effect.provide(liveLayer)),
);
