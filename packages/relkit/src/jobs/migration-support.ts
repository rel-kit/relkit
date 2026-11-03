import { Effect } from "effect";
import type { JobMigrationDiagnostic } from "./migration.types.js";

/** Constructs one breaking diagnostic within a migration Effect.
 * @param code - Stable diagnostic code.
 * @param message - Actionable explanation.
 * @returns An Effect of one breaking diagnostic with no typed error.
 * @example Effect.runSync(breakingEffect("TASK_ID_CHANGED", "Task changed"));
 */
export const breakingEffect = Effect.fn("Jobs.migrationBreaking")(function* (
  code: Extract<
    JobMigrationDiagnostic["code"],
    | "TASK_ID_CHANGED"
    | "TASK_VERSION_CHANGED"
    | "TASK_INPUT_SCHEMA_CHANGED"
    | "DEDUPE_SCOPE_CHANGED"
    | "PUBLIC_CLIENT_FINGERPRINT_CHANGED"
    | "LEGACY_JOBS_DISABLED"
    | "LEGACY_ALIAS_CONFLICT"
  >,
  message: string,
): Generator<never, JobMigrationDiagnostic, never> {
  return { code, severity: "error", breaking: true, message };
});

/** Compares schedule identifiers in authored order.
 * @param left - Previous schedule identifiers.
 * @param right - Proposed schedule identifiers.
 * @returns An Effect of whether the ordered lists match; it cannot fail.
 * @example Effect.runSync(sameEffect(["daily"], ["daily"]));
 */
export const sameEffect = Effect.fn("Jobs.migrationSame")(function* (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
});
