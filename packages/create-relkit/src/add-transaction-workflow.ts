import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Cause, Effect, Exit } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import { dependencyPatchNeedsInstallEffect } from "./dependency-patch-installation.js";
import { ADD_FAILURE_CODES, type ScaffoldPlan, type ScaffoldVerification } from "./add-types.js";
import {
  applyFileOperationsEffect,
  restoreFilesEffect,
  snapshotFilesEffect,
  validateOperationActionsEffect,
} from "./add-transaction-files.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";
import { recordCleanupFailure } from "./generator-cleanup.js";
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
        const fs = yield* GeneratorFileSystem;
        yield* validateOperationActionsEffect(plan.projectRoot, plan.operations);
        const packages = Object.keys(plan.dependencies).sort();
        const patchChanged = yield* dependencyPatchNeedsInstallEffect(plan);
        const installRequired = packages.length > 0 || patchChanged;
        const owned = yield* Effect.acquireRelease(
          Effect.gen(function* () {
            const snapshots = yield* snapshotFilesEffect(
              plan.projectRoot,
              plan.operations,
              installRequired,
            );
            const marker = join(
              plan.projectRoot,
              `.relkit-scaffold-${globalThis.process.pid}-${randomUUID()}.tmp`,
            );
            yield* fs.write(marker, "", { flag: "wx" });
            return { snapshots, marker, createdDirectories: new Set<string>() };
          }),
          (owned, exit) =>
            Effect.gen(function* () {
              if (Exit.isFailure(exit))
                yield* restoreFilesEffect(owned.snapshots, owned.createdDirectories).pipe(
                  Effect.catchCause((cause) =>
                    recordCleanupFailure(
                      exit,
                      "rollback",
                      Cause.squash(cause),
                      context.signal?.aborted ? context.signal : undefined,
                    ),
                  ),
                );
              yield* fs
                .remove(owned.marker, { force: true })
                .pipe(
                  Effect.catchCause((cause) =>
                    recordCleanupFailure(
                      exit,
                      "marker",
                      Cause.squash(cause),
                      context.signal?.aborted ? context.signal : undefined,
                    ),
                  ),
                );
            }),
        );
        yield* applyFileOperationsEffect(
          plan.projectRoot,
          plan.operations,
          owned.createdDirectories,
        );
        let verification: ScaffoldVerification;
        if (context.deferVerification)
          verification = {
            status: "skipped",
            reason: "Validation is deferred until project creation finishes.",
            command: "bun run check",
          };
        else if (installRequired && plan.request.install) {
          context.onProgress?.("Installing dependencies...");
          yield* runEffect(
            context,
            [context.bunExecutable ?? globalThis.process.execPath, "install"],
            ADD_FAILURE_CODES.installation,
            plan.projectRoot,
          );
          verification = yield* checkEffect(plan, context);
        } else if (
          patchChanged ||
          (packages.length > 0 && !(yield* packagesAvailableEffect(plan.projectRoot, packages)))
        )
          verification = {
            status: "skipped",
            reason: patchChanged
              ? "Dependency patches require bun install before checking the project."
              : `New packages are not installed: ${packages.join(", ")}`,
            command: "bun run check",
          };
        else verification = yield* checkEffect(plan, context);
        return Object.freeze({
          ok: true as const,
          command: "add" as const,
          kind: plan.request.kind,
          projectRoot: plan.projectRoot,
          createdFiles: Object.freeze(
            plan.operations.filter((item) => item.action === "create").map((item) => item.path),
          ),
          updatedFiles: Object.freeze(
            plan.operations.filter((item) => item.action === "update").map((item) => item.path),
          ),
          installedPackages: Object.freeze(plan.request.install ? packages : []),
          warnings: plan.warnings,
          verification,
          nextSteps: Object.freeze([
            ...plan.nextSteps,
            ...(verification.status === "skipped" && !context.deferVerification
              ? ["bun install", verification.command]
              : []),
          ]),
        });
      }),
    ),
  (effect) => observeExecution("generator", "ScaffoldTransaction.execute", effect),
);

import { checkEffect, runEffect, packagesAvailableEffect } from "./add-transaction-process.js";
