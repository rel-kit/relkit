export type JobBindingMigration = "implicit" | "default" | "explicit";
export type JobMigrationSeverity = "warning" | "error";

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

export interface LegacyCompatibilitySnapshot {
  readonly usesFunctionTarget: boolean;
  readonly legacyJobsEnabled: boolean;
  readonly legacyKeys?: readonly ("job" | "defaults.job" | "profile")[];
  readonly newKeys?: readonly ("jobs" | "defaults.jobs" | "service")[];
}

export function diagnoseJobMigration(
  previous: JobMigrationSnapshot,
  next: JobMigrationSnapshot,
): readonly JobMigrationDiagnostic[] {
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
      breaking(
        "TASK_ID_CHANGED",
        `Task identity changed from "${previous.taskId}" to "${next.taskId}"; historical runs stay on the old task.`,
      ),
    );
  if (previous.taskVersion !== next.taskVersion)
    diagnostics.push(
      breaking(
        "TASK_VERSION_CHANGED",
        `Task "${next.taskId}" changed version from "${previous.taskVersion}" to "${next.taskVersion}"; old runs require their pinned build.`,
      ),
    );
  if (previous.inputSchemaHash !== next.inputSchemaHash)
    diagnostics.push(
      breaking(
        "TASK_INPUT_SCHEMA_CHANGED",
        `Task "${next.taskId}" changed its input contract; retry and schedule admission must use the pinned schema.`,
      ),
    );
  if (
    previous.publicFingerprint !== next.publicFingerprint ||
    previous.clientFingerprint !== next.clientFingerprint
  ) {
    diagnostics.push(
      breaking(
        "PUBLIC_CLIENT_FINGERPRINT_CHANGED",
        `The public job contract changed for "${next.name}"; stale generated clients and watches must be rejected, not redirected.`,
      ),
    );
  }
  if (previous.dedupeScope !== next.dedupeScope)
    diagnostics.push(
      breaking(
        "DEDUPE_SCOPE_CHANGED",
        `Job "${next.name}" changed deduplication scope; accepted work and existing keys are not rewritten.`,
      ),
    );
  if (!same(previous.scheduleIds, next.scheduleIds)) {
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
}

export function diagnoseLegacyCompatibility(
  snapshot: LegacyCompatibilitySnapshot,
): readonly JobMigrationDiagnostic[] {
  const diagnostics: JobMigrationDiagnostic[] = [];
  const legacyKeys = snapshot.legacyKeys ?? [];
  const newKeys = snapshot.newKeys ?? [];
  if (snapshot.usesFunctionTarget && !snapshot.legacyJobsEnabled) {
    diagnostics.push(
      breaking(
        "LEGACY_JOBS_DISABLED",
        "Function-target jobs require compatibility.legacyJobs=true during the one-release migration window.",
      ),
    );
  }
  if (
    legacyKeys.some((key) =>
      key === "job"
        ? newKeys.includes("jobs")
        : key === "defaults.job"
          ? newKeys.includes("defaults.jobs")
          : newKeys.includes("service"),
    )
  ) {
    diagnostics.push(
      breaking(
        "LEGACY_ALIAS_CONFLICT",
        "Legacy job/profile aliases cannot be combined with their new spellings.",
      ),
    );
  } else if (legacyKeys.length > 0) {
    diagnostics.push({
      code: "LEGACY_ALIAS_DEPRECATED",
      severity: "warning",
      breaking: false,
      message:
        "Legacy job configuration aliases are accepted for one release; migrate to jobs/defaults.jobs/service.",
    });
  }
  return Object.freeze(diagnostics);
}

function breaking(
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
): JobMigrationDiagnostic {
  return { code, severity: "error", breaking: true, message };
}

function same(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}
