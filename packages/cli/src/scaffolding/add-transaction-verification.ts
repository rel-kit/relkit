/** Applies only authorized dependency installation before selected project verification. */

import { join } from "node:path";
import { Effect } from "effect";

import {
  ADD_FAILURE_CODES,
  type ScaffoldPlan,
  type ScaffoldVerification,
} from "create-relkit/internal/add-types";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";

import { checkEffect, runEffect, packagesAvailableEffect } from "./add-transaction-process.js";
export const verifyScaffoldTransaction = Effect.fn("ScaffoldTransaction.verify")(function* (
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext,
  packages: readonly string[],
  patchChanged: boolean,
  installRequired: boolean,
) {
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
  return verification;
});

export function scaffoldTransactionResult(
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext,
  packages: readonly string[],
  verification: ScaffoldVerification,
) {
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
}
