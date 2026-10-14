/** Builds an account-free source application and private state sentinels for native migration. */
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import { linkWorkspacePackages } from "../../test-workspace.js";
import { migrationFixtureFiles } from "./fixture-source.js";
import { cliPromise } from "../../src/cli-errors.js";

/**
 * Owns a native migration fixture without installs, model calls or shared application state.
 * @returns Temporary root, released after its calling scope completes.
 */
export const migrationFixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    cliPromise("test.migration.root", () =>
      mkdtemp(join(tmpdir(), "relkit-layout-migration-test-")),
    ),
    (root) =>
      cliPromise("test.migration.root.release", () =>
        rm(root, { recursive: true, force: true }),
      ).pipe(Effect.orDie),
  );
  const repository = resolve(import.meta.dirname, "../../../..");
  yield* cliPromise("test.migration.copy", async () => {
    for (const [file, text] of Object.entries(migrationFixtureFiles(repository))) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), text);
    }
    await linkWorkspacePackages(root);
    await mkdir(join(root, "node_modules/@types"), { recursive: true });
    await symlink(
      join(repository, "node_modules/@types/bun"),
      join(root, "node_modules/@types/bun"),
    );
  }).pipe(Effect.uninterruptible);
  return root;
});
