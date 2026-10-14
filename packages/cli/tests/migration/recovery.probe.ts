/** Exercises partial native publication, guarded recovery and later-edit refusal without mocks of bytes. */
import assert from "node:assert/strict";
import { writeFile, readFile, symlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Layer } from "effect";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../src/migration/layout-migration.service.js";
import { LayoutFiles, layoutFilesLayer } from "../../src/migration/layout-files.service.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { createLayoutReceipt, readLayoutReceipt } from "../../src/migration/layout-receipt.js";
import { publishLayoutEdits, restoreLayoutEdits } from "../../src/migration/layout-publication.js";
import { cliAdapterError } from "../../src/cli-errors.js";
import { migrationFixture } from "./fixture.js";
import { runLayoutProbe } from "./probe-runner.js";

/**
 * Injects one native-boundary failure after actual destination bytes have been written.
 * @returns Completion after exact byte recovery and an idempotent recovery rerun.
 */
const partialRecovery = Effect.fn("test.migration.partial")(function* () {
  const root = yield* migrationFixture;
  const plan = yield* (yield* LayoutMigration).preview(root);
  const record = yield* createLayoutReceipt(plan);
  const files = yield* LayoutFiles;
  let mutations = 0;
  const failure = new Error("injected publication failure");
  const publication = yield* Effect.exit(
    publishLayoutEdits(record.path, record.receipt).pipe(
      Effect.provideService(LayoutFiles, {
        ...files,
        put: (project, file) =>
          files
            .put(project, file)
            .pipe(
              Effect.flatMap(() =>
                ++mutations === 1 ? Effect.fail(cliAdapterError("test.put", failure)) : Effect.void,
              ),
            ),
      }),
    ),
  );
  assert(Exit.isFailure(publication));
  yield* restoreLayoutEdits(record.path, record.receipt, true);
  yield* restoreLayoutEdits(record.path, record.receipt, true);
  assert.equal((yield* readLayoutReceipt(root, record.path)).receipt.status, "restored");
  assert.deepEqual(
    (yield* files.inventory(root)).map(({ path, hash, mode }) => ({ path, hash, mode })),
    plan.files.map(({ path, hash, mode }) => ({ path, hash, mode })),
  );
});

/**
 * Proves a later destination edit refuses restoration before other files change.
 * @returns Completion with the later bytes preserved and a recovery-required receipt.
 */
const conflictingRecovery = Effect.fn("test.migration.conflict")(function* () {
  const root = yield* migrationFixture;
  const plan = yield* (yield* LayoutMigration).preview(root);
  const record = yield* createLayoutReceipt(plan);
  yield* publishLayoutEdits(record.path, record.receipt);
  const file = plan.edits.find((edit) => edit.before.path !== edit.after.path);
  assert(file !== undefined);
  yield* Effect.tryPromise(() => writeFile(join(root, file.after.path), "later user bytes"));
  const files = yield* LayoutFiles;
  const before = yield* files.inventory(root);
  assert(
    Exit.isFailure(yield* Effect.exit(restoreLayoutEdits(record.path, record.receipt, false))),
  );
  assert.deepEqual(yield* files.inventory(root), before);
  assert.equal(
    yield* Effect.tryPromise(() => readFile(join(root, file.after.path), "utf8")),
    "later user bytes",
  );
  assert.equal((yield* readLayoutReceipt(root, record.path)).receipt.status, "recovery-required");
});

/**
 * Rejects redirected recovery parent storage before creating or reading a receipt.
 * @returns Completion after the hostile parent is refused without publication.
 */
const redirectedReceipt = Effect.fn("test.migration.receipt.parents")(function* () {
  const root = yield* migrationFixture;
  const plan = yield* (yield* LayoutMigration).preview(root);
  yield* Effect.tryPromise(async () => {
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, ".relkit/migrations"));
  });
  assert(Exit.isFailure(yield* Effect.exit(createLayoutReceipt(plan))));
  assert.deepEqual((yield* (yield* LayoutMigration).preview(root)).moves, plan.moves);
});

await runLayoutProbe(
  Effect.scoped(
    Effect.gen(function* () {
      yield* partialRecovery();
      yield* conflictingRecovery();
      yield* redirectedReceipt();
    }),
  ).pipe(Effect.provide(Layer.mergeAll(layoutMigrationLayer, layoutFilesLayer, fileSystemLayer))),
);
console.log("RELKIT_LAYOUT_RECOVERY_OK");
