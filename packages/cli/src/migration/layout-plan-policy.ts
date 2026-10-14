/** Pure migration destination findings and warning policy for the selected layout. */
import type { ApplicationLayout } from "@relkit/contracts";
import type {
  MigrationFile,
  MigrationFinding,
  MigrationMove,
  MigrationPlan,
  PlannedLayoutEdit,
} from "./layout.types.js";

/**
 * Rejects occupied candidate roots using portable case-insensitive identity.
 * @param layout - Shared authored layout interpretation.
 * @param files - Complete inventoried authored bytes.
 * @param moves - Deterministic complete service moves.
 * @returns Structural/destination findings; write refuses them without mutation.
 */
export function layoutPlanConflicts(
  layout: ApplicationLayout,
  files: readonly MigrationFile[],
  moves: readonly MigrationMove[],
): MigrationFinding[] {
  const conflicts: MigrationFinding[] = layout.issues.map((issue) => ({
    file: issue.file,
    message: issue.message,
  }));
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  for (const move of moves) {
    if (
      [...paths].some(
        (path) => path === move.to.toLowerCase() || path.startsWith(`${move.to.toLowerCase()}/`),
      )
    )
      conflicts.push({
        file: move.to,
        message: "Migration destination already contains authored files.",
      });
  }

  return conflicts;
}

/**
 * Projects immutable planning records and guidance without publishing any file.
 * @param root - Canonical source root.
 * @param layout - Shared layout interpretation.
 * @param files - Complete authored byte inventory.
 * @param moves - Complete selected service moves.
 * @param edits - Candidate byte edits and their manual-action findings.
 * @returns Immutable plan used by preview, staged validation and recovery ownership.
 */
export function assembledLayoutPlan(
  root: string,
  layout: ApplicationLayout,
  files: readonly MigrationFile[],
  moves: readonly MigrationMove[],
  edits: readonly PlannedLayoutEdit[],
): MigrationPlan {
  return Object.freeze({
    root,
    layout,
    files,
    moves,
    edits: edits.map((edit) => edit.edit),
    conflicts: [
      ...layoutPlanConflicts(layout, files, moves),
      ...edits.flatMap((edit) => edit.conflicts),
    ],
    warnings:
      moves.length === 0
        ? []
        : [
            {
              file: root,
              message:
                "Stop development and external watchers before --write; unknown watchers cannot be conclusively detected.",
            },
          ],
  });
}
