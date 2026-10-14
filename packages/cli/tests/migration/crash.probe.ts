/** Recovers an actual killed publisher using only its retained receipt and matching owned bytes. */
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../src/migration/layout-migration.service.js";
import { readLayoutReceipt } from "../../src/migration/layout-receipt.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { migrationFixture } from "./fixture.js";
import { runLayoutProbe } from "./probe-runner.js";

await runLayoutProbe(
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* migrationFixture;
      const migration = yield* LayoutMigration;
      const baseline = yield* migration.preview(root);
      const killed = yield* (yield* CliProcess).run({
        command: process.execPath,
        args: [fileURLToPath(new URL("./crash-child.ts", import.meta.url)), root],
        cwd: root,
        maximumOutputBytes: 262144,
      });
      assert.notEqual(killed.exitCode, 0, killed.stdout + killed.stderr);
      const receipts = yield* Effect.promise(() => readdir(join(root, ".relkit/migrations")));
      assert.equal(receipts.length, 1);
      const id = receipts[0];
      assert(id !== undefined);
      const path = join(root, ".relkit/migrations", id, "receipt.json");
      const record = yield* readLayoutReceipt(root, path);
      assert.equal(record.receipt.status, "publishing");
      assert.equal((yield* Effect.promise(() => stat(path))).mode & 0o777, 0o600);
      assert.equal(
        (yield* Effect.promise(() => stat(join(root, ".relkit/migrations", id)))).mode & 0o777,
        0o700,
      );
      assert(record.receipt.edits.some((edit) => edit.before.path !== edit.after.path));
      yield* migration.rollback(root, path);
      const restored = yield* migration.preview(root);
      assert.deepEqual(restored.files, baseline.files);
      assert.equal((yield* readLayoutReceipt(root, path)).receipt.status, "restored");
      assert.equal(
        yield* Effect.promise(() => readFile(join(root, ".relkit/state/sentinel"), "utf8")),
        "state-byte-sentinel",
      );
      assert.equal(
        yield* Effect.promise(() =>
          readFile(join(root, ".relkit/provider-profiles/sentinel"), "utf8"),
        ),
        "provider-profile-byte-sentinel",
      );
    }),
  ).pipe(Effect.provide(Layer.mergeAll(layoutMigrationLayer, fileSystemLayer, processLayer))),
);
console.log("RELKIT_LAYOUT_CRASH_OK");
