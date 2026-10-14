/** Exercises staged/unstaged touched-file refusal and unrelated Git work preservation through real migration. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../src/migration/layout-migration.service.js";
import { assertLayoutWritePolicy, assertLayoutEpoch } from "../../src/migration/layout-guards.js";
import { layoutFilesLayer } from "../../src/migration/layout-files.service.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { processLayer } from "../../src/services/process.service.js";
import { migrationFixture } from "./fixture.js";
import { fixtureGit, initializeFixtureGit } from "./git-fixture.js";
import { runLayoutProbe } from "./probe-runner.js";

/**
 * Refuses a touched tracked edit in both Git states and a stale authored epoch.
 * @param root - Owned Git application.
 * @returns Completion after refusal without publication and restoration of only fixture bytes.
 */
const verifyTouched = Effect.fn("test.migration.git.touched")(function* (root: string) {
  const migration = yield* LayoutMigration;
  const path = join(root, "src/hello/service.ts");
  const original = yield* Effect.promise(() => readFile(path, "utf8"));
  const baseline = yield* migration.preview(root);
  yield* Effect.promise(() => writeFile(path, original + "// temporary touched change\n"));
  assert(Exit.isFailure(yield* Effect.exit(assertLayoutEpoch(baseline))));
  for (const staged of [false, true]) {
    if (staged) yield* fixtureGit(root, ["add", "src/hello/service.ts"]);
    const result = yield* Effect.exit(assertLayoutWritePolicy(yield* migration.preview(root)));
    assert(Exit.isFailure(result));
    if (Exit.isFailure(result))
      assert.match(String(Cause.squash(result.cause)), /Touched tracked file is dirty/);
  }
  yield* Effect.promise(() => writeFile(path, original));
  yield* fixtureGit(root, ["add", "src/hello/service.ts"]);
});

/**
 * Publishes and rolls back while an unrelated file has distinct staged and unstaged bytes.
 * @param root - Owned Git application with restored touched sources.
 * @returns Completion with source bytes, index content and unrelated working content preserved.
 */
const verifyUnrelated = Effect.fn("test.migration.git.unrelated")(function* (root: string) {
  const migration = yield* LayoutMigration;
  const baseline = yield* migration.preview(root);
  assert(!baseline.files.some((file) => [".npmrc", ".aws/credentials"].includes(file.path)));
  yield* Effect.promise(() => writeFile(join(root, "notes.txt"), "staged unrelated bytes"));
  yield* fixtureGit(root, ["add", "notes.txt"]);
  yield* Effect.promise(() => writeFile(join(root, "notes.txt"), "working unrelated bytes"));
  const staged = yield* fixtureGit(root, ["show", ":notes.txt"]);
  const result = yield* migration.write(root);
  assert.equal(result.status, "committed");
  assert(result.receipt !== undefined);
  assert.equal((yield* migration.write(root)).status, "noop");
  yield* migration.rollback(root, result.receipt);
  assert.equal(yield* fixtureGit(root, ["show", ":notes.txt"]), staged);
  assert.equal(
    yield* Effect.promise(() => readFile(join(root, "notes.txt"), "utf8")),
    "working unrelated bytes",
  );
  assert.equal(
    yield* Effect.promise(() => readFile(join(root, ".npmrc"), "utf8")),
    "//registry.example.test/:_authToken=registry-credential-sentinel",
  );
  assert.equal(
    yield* Effect.promise(() => readFile(join(root, ".aws/credentials"), "utf8")),
    "[fixture]\naws_secret_access_key=profile-credential-sentinel",
  );
  const restored = yield* migration.preview(root);
  assert.deepEqual(
    restored.files.filter((file) => file.path.startsWith("src/")),
    baseline.files.filter((file) => file.path.startsWith("src/")),
  );
});

await runLayoutProbe(
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* migrationFixture;
      yield* Effect.promise(() => writeFile(join(root, "notes.txt"), "baseline notes"));
      yield* initializeFixtureGit(root);
      yield* verifyTouched(root);
      yield* verifyUnrelated(root);
    }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(layoutMigrationLayer, layoutFilesLayer, fileSystemLayer, processLayer),
    ),
  ),
);
console.log("RELKIT_LAYOUT_GIT_OK");
