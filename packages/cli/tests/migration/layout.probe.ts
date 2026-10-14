/** Runs real preview/write/no-op/rollback with native Bun compilation and byte sentinels. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../src/migration/layout-migration.service.js";
import { runLayoutProbe } from "./probe-runner.js";
import { migrationFixture } from "./fixture.js";

const probe = Effect.scoped(
  Effect.gen(function* () {
    const root = yield* migrationFixture;
    const migration = yield* LayoutMigration;
    const plan = yield* migration.preview(root);
    assert.equal(plan.conflicts.length, 0);
    assert.deepEqual(plan.moves, [{ from: "src/hello", to: "src/services/hello" }]);
    assert(plan.edits.some((edit) => edit.before.path.endsWith("message.bin")));
    assert.equal(
      plan.edits.find((edit) => edit.before.path === "src/routes/route.ts")?.after.path,
      "src/routes/route.ts",
    );
    const before = plan.files.map(({ path, hash, mode }) => ({ path, hash, mode }));
    assert.deepEqual(
      (yield* migration.preview(root)).files.map(({ path, hash, mode }) => ({ path, hash, mode })),
      before,
    );
    const result = yield* migration.write(root);
    assert.equal(result.status, "committed");
    if (result.receipt === undefined) throw new Error("Missing recovery receipt");
    assert.equal((yield* Effect.tryPromise(() => stat(result.receipt))).mode & 0o777, 0o600);
    assert.equal((yield* migration.write(root)).status, "noop");
    yield* migration.rollback(root, result.receipt);
    assert.deepEqual(
      (yield* migration.preview(root)).files.map(({ path, hash, mode }) => ({ path, hash, mode })),
      before,
    );
    const repeated = yield* migration.write(root);
    assert.equal(repeated.status, "committed");
    if (repeated.receipt === undefined) throw new Error("Missing repeated receipt");
    yield* migration.rollback(root, repeated.receipt);
    for (const [file, contents] of [
      [".relkit/state/sentinel", "state-byte-sentinel"],
      [".relkit/observability/sentinel", "observability-byte-sentinel"],
      ["migrations/sentinel.sql", "migration-byte-sentinel"],
      ["bun.lock", "lock-byte-sentinel"],
      [".env.local", "SECRET=credential-byte-sentinel"],
    ]) {
      if (file === undefined) throw new Error("Missing sentinel path");
      assert.equal(yield* Effect.tryPromise(() => readFile(join(root, file), "utf8")), contents);
    }
  }),
).pipe(Effect.provide(layoutMigrationLayer));

await runLayoutProbe(probe);
console.log("RELKIT_LAYOUT_MIGRATION_OK");
