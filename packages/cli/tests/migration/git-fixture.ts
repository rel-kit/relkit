/** Creates an explicitly owned temporary Git repository for the required migration acceptance matrix. */
import assert from "node:assert/strict";
import { Effect } from "effect";
import { CliProcess } from "../../src/services/process.service.js";

/**
 * Executes Git only within the temporary fixture root.
 * @param root - Test-owned application directory.
 * @param args - Literal local Git operation.
 * @returns Native stdout after the owned process settles.
 */
export const fixtureGit = Effect.fn("test.migration.git")(function* (
  root: string,
  args: readonly string[],
) {
  const result = yield* (yield* CliProcess).run({ command: "git", args: [...args], cwd: root });
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
});

/**
 * Commits only generated fixture sources and one unrelated fixture file.
 * @param root - Test-owned application with no preexisting Git repository.
 * @returns A local baseline without touching repository/global Git configuration.
 */
export const initializeFixtureGit = Effect.fn("test.migration.git.initialize")(function* (
  root: string,
) {
  yield* fixtureGit(root, ["init", "-q"]);
  yield* fixtureGit(root, [
    "add",
    "src",
    "package.json",
    "tsconfig.json",
    "relkit.config.ts",
    "notes.txt",
  ]);
  yield* fixtureGit(root, [
    "-c",
    "user.name=RELKIT Test",
    "-c",
    "user.email=fixture@relkit.test",
    "commit",
    "-q",
    "-m",
    "temporary migration fixture",
  ]);
});
