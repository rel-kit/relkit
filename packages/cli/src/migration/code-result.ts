/**
 * Projects code-migration plans and receipts into the result `relkit migrate` prints, and
 * renders its human summary: changed files with the rules that changed them, then every
 * finding as `file:line  message`, then the next commands. File bytes never appear.
 */
import type { CodeMigrationPlan, CodeMigrationResult } from "./code-migration.types.js";
import type { CodeReceiptRecord } from "./code-receipt.schemas.js";

const nextSteps = ["bun install", "bun run check", "bun run typecheck", "bun run test"];

/**
 * Builds the result of a preview or write.
 * @param plan - Planned changes and findings.
 * @param status - Outcome.
 * @param receipt - Receipt path after a write.
 * @returns The printable result.
 */
export function codeMigrationResult(
  plan: CodeMigrationPlan,
  status: CodeMigrationResult["status"],
  receipt?: string,
): CodeMigrationResult {
  return {
    ok: status !== "refused",
    status,
    changes: plan.changes.map((change) => ({
      path: change.path,
      created: change.before === undefined,
      rules: change.rules,
    })),
    findings: plan.findings,
    ...(receipt === undefined ? {} : { receipt }),
    nextSteps: status === "committed" ? nextSteps : [],
  };
}

/**
 * Builds the result of a rollback.
 * @param receipt - Restored record.
 * @param path - Record path.
 * @returns The printable result.
 */
export function codeRollbackResult(receipt: CodeReceiptRecord, path: string): CodeMigrationResult {
  return {
    ok: true,
    status: "rolled-back",
    changes: receipt.edits.map((edit) => ({
      path: edit.path,
      created: edit.before === undefined,
      rules: [],
    })),
    findings: [],
    receipt: path,
    nextSteps,
  };
}

/**
 * Renders the human summary.
 * @param result - Printable result.
 * @returns Plain text lines for the terminal.
 */
export function renderCodeMigration(result: CodeMigrationResult): string {
  const title = {
    preview: "Preview: relkit migrate would change these files. Run with --write to apply.",
    noop: "Nothing to migrate.",
    committed: "Migrated. Undo with relkit migrate --rollback <record>.",
    "rolled-back": "Rolled back the migration.",
    refused: "Migration refused.",
  }[result.status];
  const lines = [title];
  for (const change of result.changes)
    lines.push(
      `  ${change.created ? "create" : "update"} ${change.path}${change.rules.length ? `  (${change.rules.join(", ")})` : ""}`,
    );
  if (result.findings.length > 0) {
    lines.push("", `Change these by hand (${result.findings.length}):`);
    for (const finding of result.findings)
      lines.push(`  ${finding.file}:${finding.line}  ${finding.message}`);
  }
  if (result.receipt !== undefined) lines.push("", `Migration record: ${result.receipt}`);
  if (result.nextSteps.length > 0)
    lines.push("", "Next:", ...result.nextSteps.map((step) => `  ${step}`));
  return lines.join("\n");
}
