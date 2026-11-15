/** Applies only authorized dependency installation before selected project verification. */

import { join } from "node:path";
import { Effect } from "effect";

import {
  ADD_FAILURE_CODES,
  type ScaffoldPlan,
  type ScaffoldVerification,
} from "create-relkit/add-types";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";

import { checkEffect, runEffect, packagesAvailableEffect } from "./add-transaction-process.js";
import {
  packageManagerCommands,
  projectPackageManager,
  type PackageManagerCommands,
} from "create-relkit/package-manager";
export const verifyScaffoldTransaction = Effect.fn("ScaffoldTransaction.verify")(function* (
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext,
  packages: readonly string[],
  patchChanged: boolean,
  installRequired: boolean,
) {
  const manager = packageManagerCommands(projectPackageManager(plan.projectRoot));
  let verification: ScaffoldVerification;
  if (context.deferVerification)
    verification = {
      status: "skipped",
      reason: "Validation is deferred until project creation finishes.",
      command: manager.run("check"),
    };
  else if (installRequired && plan.request.install) {
    context.onProgress?.("Installing dependencies...");
    yield* runEffect(
      context,
      installCommand(manager, context.bunExecutable),
      ADD_FAILURE_CODES.installation,
      plan.projectRoot,
      `${manager.installText} failed: `,
    );
    verification = yield* checkEffect(plan, context);
  } else if (
    patchChanged ||
    (packages.length > 0 && !(yield* packagesAvailableEffect(plan.projectRoot, packages)))
  )
    verification = {
      status: "skipped",
      reason: patchChanged
        ? `Dependency patches require ${manager.installText} before checking the project.`
        : `New packages are not installed: ${packages.join(", ")}`,
      command: manager.run("check"),
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
  const { installText } = packageManagerCommands(projectPackageManager(plan.projectRoot));
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
        ? [installText, verification.command]
        : []),
    ]),
  });
}

/**
 * Spells the project's install with its package manager.
 * @param manager - The project's package manager.
 * @param bunExecutable - Explicit Bun executable, when given.
 * @returns Executable and arguments.
 */
function installCommand(
  manager: PackageManagerCommands,
  bunExecutable: string | undefined,
): string[] {
  if (manager.name !== "bun") return [manager.name, ...manager.install];
  const onBun = typeof globalThis.process.versions.bun === "string";
  return [bunExecutable ?? (onBun ? globalThis.process.execPath : "bun"), ...manager.install];
}
