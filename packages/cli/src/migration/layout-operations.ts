/** Composes guarded publication and recovery; the migration service captures native dependencies. */
import { resolve } from "node:path";
import { Effect, Exit } from "effect";
import { observeCli } from "../cli-runtime.js";
import { planLayoutMigration } from "./layout-plan.js";
import { layoutMigrationResult, rollbackMigrationResult } from "./layout-result.js";
import { assertLayoutEpoch, assertLayoutWritePolicy } from "./layout-guards.js";
import { createLayoutReceipt, readLayoutReceipt } from "./layout-receipt.js";
import { publishLayoutEdits, restoreLayoutEdits } from "./layout-publication.js";
import { validateLayoutCandidate } from "./layout-validation.js";

/**
 * Validates a fresh plan and publishes only after epoch and ownership rechecks.
 * @param root - Caller-selected application root.
 * @returns Secret-free result with guarded recovery on failure or interruption.
 */
export const writeLayoutMigration = Effect.fn("Migration.write")(
  function* (root: string) {
    const plan = yield* planLayoutMigration(resolve(root));
    if (plan.conflicts.length) return layoutMigrationResult(plan, "refused");
    if (plan.moves.length === 0) return layoutMigrationResult(plan, "noop");
    yield* assertLayoutWritePolicy(plan);
    yield* Effect.scoped(validateLayoutCandidate(plan));
    yield* assertLayoutEpoch(plan);
    yield* assertLayoutWritePolicy(plan);
    return yield* Effect.acquireUseRelease(
      createLayoutReceipt(plan),
      ({ path, receipt }) =>
        publishLayoutEdits(path, receipt).pipe(
          Effect.as(layoutMigrationResult(plan, "committed", path)),
        ),
      ({ path, receipt }, exit) => {
        if (Exit.isFailure(exit))
          return restoreLayoutEdits(path, receipt, true).pipe(Effect.asVoid, Effect.orDie);
        return Effect.void;
      },
    );
  },
  (effect) => observeCli("migration.write", effect),
);

/**
 * Restores a committed migration or a matching partial crash record.
 * @param root - Caller-selected application root.
 * @param path - Restricted local recovery receipt.
 * @returns Exact fresh-preparation guidance after guarded restoration.
 */
export const rollbackLayoutMigration = Effect.fn("Migration.rollback")(
  function* (root: string, path: string) {
    const record = yield* readLayoutReceipt(resolve(root), path);
    yield* restoreLayoutEdits(record.path, record.receipt, record.receipt.status !== "committed");
    return rollbackMigrationResult(record.receipt, record.path);
  },
  (effect) => observeCli("migration.rollback", effect),
);
