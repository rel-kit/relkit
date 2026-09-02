export interface ActivationFingerprint {
  readonly graphHash: string;
  readonly manifestHash: string;
  readonly runtimeIntegrationsPlanHash: string;
  readonly localServicesPlanHash?: string;
  readonly providerOverridesGeneration?: string;
}

export interface IntegrationProvenance {
  readonly integrationId: string;
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
  readonly packageName: string;
  readonly packageVersion: string;
}

export function readActivationFingerprint(value: unknown): ActivationFingerprint | undefined {
  const item = record(value);
  const graphHash = text(item?.graphHash);
  const manifestHash = text(item?.manifestHash);
  const runtimeIntegrationsPlanHash = text(item?.runtimeIntegrationsPlanHash);
  if (
    graphHash === undefined ||
    manifestHash === undefined ||
    runtimeIntegrationsPlanHash === undefined
  )
    return undefined;
  const localServicesPlanHash = text(item?.localServicesPlanHash);
  const providerOverridesGeneration = text(item?.providerOverridesGeneration);
  return {
    graphHash,
    manifestHash,
    runtimeIntegrationsPlanHash,
    ...(localServicesPlanHash === undefined ? {} : { localServicesPlanHash }),
    ...(providerOverridesGeneration === undefined ? {} : { providerOverridesGeneration }),
  };
}

export function readIntegrationProvenance(value: unknown): readonly IntegrationProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    const integrationId = text(item?.integrationId);
    const capability = text(item?.capability);
    const adapterId = text(item?.adapterId);
    const packageName = text(item?.packageName);
    const packageVersion = text(item?.packageVersion);
    const protocolVersion = integer(item?.protocolVersion);
    return integrationId &&
      capability &&
      adapterId &&
      packageName &&
      packageVersion &&
      protocolVersion
      ? [{ integrationId, capability, adapterId, protocolVersion, packageName, packageVersion }]
      : [];
  });
}

export function integrationFor(
  integrations: readonly IntegrationProvenance[],
  capability: string,
  integrationId: string,
  adapterId: string,
): IntegrationProvenance | undefined {
  return integrations.find(
    (entry) =>
      entry.capability === capability &&
      entry.integrationId === integrationId &&
      entry.adapterId === adapterId,
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}
