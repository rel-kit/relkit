/** Syntax edits and precise manual-action findings for a migration candidate. */
import type { MigrationFinding } from "./layout.types.js";
export interface LayoutTextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
export interface LayoutRewrite {
  readonly text: string;
  readonly conflicts: readonly MigrationFinding[];
}
