/** Contracts for immutable layout plans and owner-only, guarded recovery records. */
import type { ApplicationLayout } from "@relkit/contracts";
import type { Effect, Schema } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { LayoutFile, LayoutEdit, LayoutReceipt } from "./layout.schemas.js";

export type MigrationFile = Schema.Schema.Type<typeof LayoutFile>;
export type MigrationEdit = Schema.Schema.Type<typeof LayoutEdit>;
export type MigrationReceipt = Schema.Schema.Type<typeof LayoutReceipt>;
/** Candidate file edit plus unsupported-reference findings owned by planning. */
export interface PlannedLayoutEdit {
  readonly edit: MigrationEdit;
  readonly conflicts: readonly MigrationFinding[];
}
export interface MigrationMove {
  readonly from: string;
  readonly to: string;
}
export interface MigrationFinding {
  readonly file: string;
  readonly message: string;
}
export interface MigrationPlan {
  readonly root: string;
  readonly layout: ApplicationLayout;
  readonly files: readonly MigrationFile[];
  readonly edits: readonly MigrationEdit[];
  readonly moves: readonly MigrationMove[];
  readonly warnings: readonly MigrationFinding[];
  readonly conflicts: readonly MigrationFinding[];
}
export interface MigrationResult {
  readonly ok: boolean;
  readonly status: "preview" | "noop" | "committed" | "rolled-back" | "refused";
  readonly layout: ApplicationLayout["kind"];
  readonly moves: readonly MigrationMove[];
  readonly edits: readonly { readonly from: string; readonly to: string }[];
  readonly warnings: readonly MigrationFinding[];
  readonly conflicts: readonly MigrationFinding[];
  readonly verification: "not-run" | "passed";
  readonly receipt?: string;
  readonly nextSteps: readonly string[];
}
/** Native snapshot operations settle mutations before interruption can begin recovery. */
export interface MigrationFileOperations {
  /**
   * Captures authored bytes, excluding dependencies, generated/persistent state and credentials.
   * @param root - Canonical authored root.
   * @returns Complete deterministic snapshots without following authored symlinks.
   */
  readonly inventory: (root: string) => Effect.Effect<readonly MigrationFile[], CliAdapterError>;
  /**
   * Reads one exact contained snapshot; absence is distinct from native failure.
   * @param root - Canonical authored or staged root.
   * @param path - Contained project-relative path.
   * @returns Current complete bytes/modes or undefined when absent.
   */
  readonly read: (
    root: string,
    path: string,
  ) => Effect.Effect<MigrationFile | undefined, CliAdapterError>;
  /**
   * Publishes complete owned bytes and permissions after path guards.
   * @param root - Canonical authored or staged root.
   * @param file - Exact file snapshot whose native mutation settles before recovery.
   * @returns Completion or a typed native failure.
   */
  readonly put: (root: string, file: MigrationFile) => Effect.Effect<void, CliAdapterError>;
  /**
   * Removes only an exact owned file after its preceding fingerprint guard.
   * @param root - Canonical authored or staged root.
   * @param path - Exact contained path.
   * @returns Native unlink completion; missing files remain failures.
   */
  readonly remove: (root: string, path: string) => Effect.Effect<void, CliAdapterError>;
}
