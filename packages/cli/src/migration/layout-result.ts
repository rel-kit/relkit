/** Projects secret-free migration results; byte snapshots never reach stdout. */
import type { MigrationPlan, MigrationResult, MigrationReceipt } from "./layout.types.js";
import { serviceSource } from "relkit/contracts";
import { packageManagerCommands, projectPackageManager } from "create-relkit/package-manager";

/**
 * Projects a preview or publication result without bytes, environment values or private causes.
 * @param plan - Immutable authored plan.
 * @param status - Final public operation state.
 * @param receipt - Optional restricted local recovery path.
 * @returns One machine-readable result and exact fresh-generation next steps.
 */
export function layoutMigrationResult(
  plan: MigrationPlan,
  status: MigrationResult["status"],
  receipt?: string,
): MigrationResult {
  return {
    ok: status !== "refused" && plan.conflicts.length === 0,
    status,
    layout: status === "committed" ? "grouped" : plan.layout.kind,
    moves: plan.moves,
    edits: plan.edits.map(({ before, after }) => ({ from: before.path, to: after.path })),
    warnings: plan.warnings,
    conflicts: plan.conflicts,
    verification: status === "committed" ? "passed" : "not-run",
    ...(receipt === undefined ? {} : { receipt }),
    nextSteps: status === "committed" ? nextSteps(plan.root) : [],
  };
}

/**
 * Projects receipt rollback without disclosing original or migrated source bytes.
 * @param receipt - Validated exact ownership.
 * @param path - Restricted local recovery path.
 * @returns One complete rollback result and fresh preparation instructions.
 */
export function rollbackMigrationResult(
  root: string,
  receipt: MigrationReceipt,
  path: string,
): MigrationResult {
  const moves = receipt.edits.flatMap((edit) => {
    const before = serviceSource(edit.before.path),
      after = serviceSource(edit.after.path);
    if (before?.relative !== "service.ts" || after?.relative !== "service.ts") return [];
    return [{ from: after.root, to: before.root }];
  });
  return {
    ok: true,
    status: "rolled-back",
    layout: "flat",
    moves,
    edits: receipt.edits.map((edit) => ({ from: edit.after.path, to: edit.before.path })),
    warnings: [],
    conflicts: [],
    verification: "not-run",
    receipt: path,
    nextSteps: nextSteps(root),
  };
}

/**
 * Spells the commands to run after a layout migration with the project's package manager.
 * @param root - Project root.
 * @returns Check, typecheck, fresh preparation and development commands.
 */
function nextSteps(root: string): readonly string[] {
  const manager = packageManagerCommands(projectPackageManager(root));
  return [
    manager.run("check"),
    manager.run("typecheck"),
    manager.run("dev -- --prepare"),
    manager.run("dev"),
  ];
}
