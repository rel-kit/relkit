import type { JsonValue } from "@relkit/contracts";
import { isRecord, safeJson, safeSource, stringValue } from "./shared.js";

/**
 * Selects public provider topology fields while excluding native files and credentials.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted provider declaration.
 */
export function projectProviderNode(value: Record<string, unknown>): JsonValue {
  const adapter = isRecord(value.adapter) ? value.adapter : {};
  const result: Record<string, unknown> = {
    kind: "provider",
    id: value.id,
    capability: stringValue(value.capability) ?? "unknown",
    profile: stringValue(value.profile) ?? "default",
    adapter: {
      integrationId: stringValue(adapter.integrationId) ?? "unknown",
      adapterId: stringValue(adapter.adapterId) ?? "unknown",
      protocolVersion: positiveInteger(adapter.protocolVersion) ?? 1,
      features: strings(adapter.features),
    },
    providerSource: providerSource(value.providerSource),
    namedValues: namedValues(value.namedValues),
    deploymentRoles: deploymentRoles(value.deploymentRoles),
  };
  const local = localRecipe(value.local);
  if (local !== undefined) result.local = local;
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  return safeJson(result);
}

/**
 * Selects public application topology and declared deployment evidence.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted application declaration.
 */
export function projectAppNode(value: Record<string, unknown>): JsonValue {
  const result: Record<string, unknown> = { kind: "app", id: value.id };
  for (const key of ["environment", "defaults"])
    if (value[key] !== undefined) result[key] = value[key];
  const telemetry = telemetryTopology(value.telemetry);
  if (telemetry !== undefined) result.telemetry = telemetry;
  result.deploymentRoles = deploymentRoles(value.deploymentRoles);
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  return safeJson(result);
}

/**
 * Projects declared integration provenance without loading private provider implementations.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public provenance records in source order.
 */
export function projectIntegrationProvenance(value: unknown): JsonValue[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.integrations)
      ? value.integrations
      : [];
  return entries
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const fields = [
        "integrationId",
        "capability",
        "adapterId",
        "packageName",
        "packageVersion",
      ] as const;
      if (fields.some((field) => stringValue(entry[field]) === undefined)) return [];
      const protocolVersion = positiveInteger(entry.protocolVersion);
      if (protocolVersion === undefined) return [];
      return [
        safeJson({
          ...Object.fromEntries(fields.map((field) => [field, entry[field]])),
          protocolVersion,
        }),
      ];
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

/**
 * Selects declared telemetry topology and bounded exporter identities.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public telemetry topology evidence.
 */
function telemetryTopology(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const exporters = isRecord(value.exporters)
    ? Object.entries(value.exporters).flatMap(([name, exporter]) => {
        if (!isRecord(exporter)) return [];
        const integrationId = stringValue(exporter.integrationId);
        const adapterId = stringValue(exporter.adapterId);
        const protocolVersion = positiveInteger(exporter.protocolVersion);
        return integrationId === undefined ||
          adapterId === undefined ||
          protocolVersion === undefined
          ? []
          : [{ name, integrationId, adapterId, protocolVersion }];
      })
    : [];
  return {
    ...(isRecord(value.capture) ? { capture: value.capture } : {}),
    ...(isRecord(value.localRetention) ? { localRetention: value.localRetention } : {}),
    ...(isRecord(value.exportSampling) ? { exportSampling: value.exportSampling } : {}),
    exporters: exporters.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

/**
 * Selects a safe public provider declaration location.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A safe source location or undefined.
 */
function providerSource(value: unknown): Record<string, unknown> {
  if (
    !isRecord(value) ||
    !["connected", "local-only", "infrastructure"].includes(String(value.kind))
  )
    return { kind: "unknown" };
  return {
    kind: value.kind,
    ...(value.kind === "infrastructure" && stringValue(value.integrationId) !== undefined
      ? { integrationId: value.integrationId }
      : {}),
  };
}

/**
 * Projects declared named topology collections in stable order.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Named public metadata records.
 */
function namedValues(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || stringValue(entry.name) === undefined) return [];
    return [
      {
        ...(stringValue(entry.field) === undefined ? {} : { field: entry.field }),
        name: entry.name,
        type: stringValue(entry.type) ?? "unknown",
        sensitive: entry.sensitive === true,
      },
    ];
  });
}

/**
 * Selects declared local-service recipe metadata without executable provisioning configuration.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A public local recipe.
 */
function localRecipe(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const integrationId = stringValue(value.integrationId);
  const recipeId = stringValue(value.recipeId);
  const recipeVersion = positiveInteger(value.recipeVersion);
  return integrationId === undefined || recipeId === undefined || recipeVersion === undefined
    ? undefined
    : { integrationId, recipeId, recipeVersion };
}

/**
 * Selects public deployment role identities from declaration metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public deployment role records.
 */
function deploymentRoles(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const role = stringValue(entry.role);
    const integrationId = stringValue(entry.integrationId);
    const protocolVersion = positiveInteger(entry.protocolVersion);
    return role === undefined || integrationId === undefined || protocolVersion === undefined
      ? []
      : [{ role, integrationId, protocolVersion }];
  });
}

/**
 * Accepts only stored string metadata from the selected collection.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The accepted string values.
 */
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [];
}

/**
 * Accepts finite positive integer topology bounds.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted bound or undefined.
 */
function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}
