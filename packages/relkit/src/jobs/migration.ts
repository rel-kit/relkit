import { Effect } from "effect";
import { observeJobs } from "./jobs-observability.js";
import { breakingEffect, sameEffect } from "./migration-support.js";
import type { JobMigrationDiagnostic, JobMigrationSnapshot } from "./migration.types.js";

export type {
  JobBindingMigration,
  JobMigrationDiagnostic,
  JobMigrationSeverity,
  JobMigrationSnapshot,
} from "./migration.types.js";

/** Diagnoses identity and contract changes between two job snapshots in Effect.
 * @param previous - Previously deployed job facts.
 * @param next - Proposed job facts.
 * @returns An Effect of ordered diagnostics with no typed error.
 * @example Effect.runSync(diagnoseJobMigrationEffect(previous, next));
 */
export const diagnoseJobMigrationEffect = Effect.fn("Jobs.diagnoseJobMigration")(
  function* (previous: JobMigrationSnapshot, next: JobMigrationSnapshot) {
    const diagnostics: JobMigrationDiagnostic[] = [];
    if (previous.id !== next.id) {
      diagnostics.push({
        code:
          previous.idSource === "explicit"
            ? "PINNED_JOB_ID_CHANGED"
            : "DEFAULT_DERIVED_JOB_ID_RENAME",
        severity: "error",
        breaking: true,
        message:
          previous.idSource === "explicit"
            ? `Job "${previous.name}" changed pinned ID from "${previous.id}" to "${next.id}"; retain the old ID for accepted work.`
            : `Job "${previous.name}" changed its default-derived ID; preserve "${previous.id}" explicitly before renaming it.`,
      });
    }
    if (previous.binding === "implicit" && next.binding !== "implicit") {
      diagnostics.push({
        code: "IMPLICIT_TO_EXPLICIT_BINDING",
        severity: "warning",
        breaking: true,
        message: `Job "${previous.name}" moved from its implicit binding to "${next.binding}"; keep the old binding routable until accepted work drains.`,
      });
    }
    if (previous.taskId !== next.taskId)
      diagnostics.push(
        yield* breakingEffect(
          "TASK_ID_CHANGED",
          `Task identity changed from "${previous.taskId}" to "${next.taskId}"; historical runs stay on the old task.`,
        ),
      );
    if (previous.taskVersion !== next.taskVersion)
      diagnostics.push(
        yield* breakingEffect(
          "TASK_VERSION_CHANGED",
          `Task "${next.taskId}" changed version from "${previous.taskVersion}" to "${next.taskVersion}"; old runs require their pinned build.`,
        ),
      );
    if (previous.inputSchemaHash !== next.inputSchemaHash)
      diagnostics.push(
        yield* breakingEffect(
          "TASK_INPUT_SCHEMA_CHANGED",
          `Task "${next.taskId}" changed its input contract; retry and schedule admission must use the pinned schema.`,
        ),
      );
    if (
      previous.publicFingerprint !== next.publicFingerprint ||
      previous.clientFingerprint !== next.clientFingerprint
    ) {
      diagnostics.push(
        yield* breakingEffect(
          "PUBLIC_CLIENT_FINGERPRINT_CHANGED",
          `The public job contract changed for "${next.name}"; stale generated clients and watches must be rejected, not redirected.`,
        ),
      );
    }
    if (previous.dedupeScope !== next.dedupeScope)
      diagnostics.push(
        yield* breakingEffect(
          "DEDUPE_SCOPE_CHANGED",
          `Job "${next.name}" changed deduplication scope; accepted work and existing keys are not rewritten.`,
        ),
      );
    if (!(yield* sameEffect(previous.scheduleIds, next.scheduleIds))) {
      diagnostics.push({
        code: "SCHEDULE_TARGET_CHANGED",
        severity: "warning",
        breaking: false,
        message: `Schedules for "${next.name}" changed; reconcile owned schedules only after the new worker is ready and preserve operator pauses.`,
      });
    }
    if (previous.hasHistoricalRuns === true && previous.id !== next.id) {
      diagnostics.push({
        code: "HISTORICAL_RUNS_PINNED",
        severity: "warning",
        breaking: false,
        message: `Historical runs for "${previous.name}" remain pinned to ID "${previous.id}"; no accepted run is silently moved.`,
      });
    }
    return Object.freeze(diagnostics);
  },
  (effect) => observeJobs("migration.diagnose", effect),
);

/** Synchronous migration diagnostic adapter.
 * @param previous - Previously deployed job facts.
 * @param next - Proposed job facts.
 * @returns Ordered immutable diagnostics.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example diagnoseJobMigration(previous, next);
 */
export function diagnoseJobMigration(
  previous: JobMigrationSnapshot,
  next: JobMigrationSnapshot,
): readonly JobMigrationDiagnostic[] {
  return Effect.runSync(diagnoseJobMigrationEffect(previous, next));
}
