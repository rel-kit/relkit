export interface RelkitKeyScope {
  readonly backend: string;
  readonly applicationId: string;
  readonly identityScope: string;
  readonly sessionEpoch: string;
  readonly identityKey: string | null | undefined;
  readonly publicFingerprint: string;
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
    kind,
    procedureId,
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
