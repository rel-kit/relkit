export interface RelkitKeyScope {
  readonly backend: string;
  readonly applicationId: string;
  readonly identityScope: string;
  readonly sessionEpoch: string;
  readonly identityKey: string | null | undefined;
  readonly publicFingerprint: string;
  readonly environment?: string;
  readonly jobsProtocolVersion?: number;
}

export function relkitKey(
  scope: RelkitKeyScope,
  kind: "query" | "mutation" | "stream" | "agent" | "channel",
  procedureId: string,
  input?: unknown,
): readonly unknown[] {
  return [
    "relkit",
    scope.backend,
    scope.applicationId,
    scope.identityScope,
    scope.sessionEpoch,
    scope.identityKey ?? "",
    scope.publicFingerprint,
    scope.environment ?? "",
    scope.jobsProtocolVersion ?? 1,
    kind,
    procedureId,
    canonical(input),
  ] as const;
}

export interface RelkitJobKeyOptions {
  readonly jobId: string;
  readonly runId?: string;
  readonly projection?: string;
  readonly schemaVersion?: string;
  readonly environment?: string;
  readonly jobsProtocolVersion?: number;
}

export function relkitJobKey(
  scope: RelkitKeyScope,
  operation: "trigger" | "run" | "cancel" | "retry",
  options: RelkitJobKeyOptions,
  input?: unknown,
): readonly unknown[] {
  return [
    "relkit",
    "job",
    scope.backend,
    scope.applicationId,
    options.environment ?? scope.environment ?? "",
    scope.identityScope,
    scope.sessionEpoch,
    scope.identityKey ?? "",
    scope.publicFingerprint,
    options.jobsProtocolVersion ?? scope.jobsProtocolVersion ?? 1,
    options.jobId,
    options.runId ?? "",
    options.projection ?? "",
    options.schemaVersion ?? "",
    operation,
    canonical(input),
  ] as const;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}
