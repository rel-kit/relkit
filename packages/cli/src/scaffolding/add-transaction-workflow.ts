/** Orders scaffold mutation, optional installation and verification under the same transaction scope so failures restore the acquired snapshot. */

import { acquireScaffoldTransaction } from "./add-transaction-acquisition.js";
import {
  verifyScaffoldTransaction,
  scaffoldTransactionResult,
} from "./add-transaction-verification.js";

import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import { dependencyPatchNeedsInstallEffect } from "create-relkit/internal/dependency-patch-installation";
import { type ScaffoldPlan } from "create-relkit/internal/add-types";
import {
  applyFileOperationsEffect,
  validateOperationActionsEffect,
} from "create-relkit/internal/add-transaction-files";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";

/**
 * Acquires rollback ownership before the first mutation and keeps install/check within that scope.
 * @param plan - Complete immutable operation plan.
 * @param context - Caller-owned settings and cancellation.
 * @returns The completed AddResult after commit or an original failure after owned rollback settles.
 */
export const transactionEffect = Effect.fn("ScaffoldTransaction.execute")(
  (plan: ScaffoldPlan, context: ApplyScaffoldContext) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* validateOperationActionsEffect(plan.projectRoot, plan.operations);
        const packages = Object.keys(plan.dependencies).sort();
        const patchChanged = yield* dependencyPatchNeedsInstallEffect(plan);
        const installRequired = packages.length > 0 || patchChanged;
        const owned = yield* acquireScaffoldTransaction(plan, context, installRequired);
        yield* applyFileOperationsEffect(
          plan.projectRoot,
          plan.operations,
          owned.createdDirectories,
        );
        const verification = yield* verifyScaffoldTransaction(
          plan,
          context,
          packages,
          patchChanged,
          installRequired,
        );
        return scaffoldTransactionResult(plan, context, packages, verification);
      }),
    ),
  (effect) => observeExecution("generator", "ScaffoldTransaction.execute", effect),
);
