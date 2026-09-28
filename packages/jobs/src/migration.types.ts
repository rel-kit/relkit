/** Binding mode recorded in a job migration snapshot. */
export type JobBindingMigration = "implicit" | "default" | "explicit";

/** Severity assigned to one compatibility diagnostic. */
export type JobMigrationSeverity = "warning" | "error";

/** Versioned job identity and public contract facts used by migration checks. */
export interface JobMigrationSnapshot {
  readonly name: string;
  readonly id: string;
  readonly idSource?: "explicit" | "name";
  readonly taskId: string;
  readonly taskVersion: string;
  readonly inputSchemaHash?: string;
  readonly binding: JobBindingMigration;
  readonly publicFingerprint?: string;
  readonly clientFingerprint?: string;
  readonly service?: string;
  readonly hasHistoricalRuns?: boolean;
  readonly scheduleIds?: readonly string[];
  readonly dedupeScope?: string;
}

/** Actionable compatibility finding for an authored job change. */
export interface JobMigrationDiagnostic {
  readonly code:
    | "DEFAULT_DERIVED_JOB_ID_RENAME"
    | "PINNED_JOB_ID_CHANGED"
    | "IMPLICIT_TO_EXPLICIT_BINDING"
    | "TASK_ID_CHANGED"
    | "TASK_VERSION_CHANGED"
    | "TASK_INPUT_SCHEMA_CHANGED"
    | "HISTORICAL_RUNS_PINNED"
    | "SCHEDULE_TARGET_CHANGED"
    | "DEDUPE_SCOPE_CHANGED"
    | "PUBLIC_CLIENT_FINGERPRINT_CHANGED"
    | "LEGACY_JOBS_DISABLED"
    | "LEGACY_ALIAS_CONFLICT"
    | "LEGACY_ALIAS_DEPRECATED";
  readonly severity: JobMigrationSeverity;
  readonly breaking: boolean;
  readonly message: string;
}

/** Legacy and replacement configuration keys involved in migration. */
export interface LegacyCompatibilitySnapshot {
  readonly usesFunctionTarget: boolean;
  readonly legacyJobsEnabled: boolean;
  readonly legacyKeys?: readonly ("job" | "defaults.job" | "profile")[];
  readonly newKeys?: readonly ("jobs" | "defaults.jobs" | "service")[];
}
