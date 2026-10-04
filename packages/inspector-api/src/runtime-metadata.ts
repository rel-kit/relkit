import type { JsonValue } from "@relkit/contracts";
import { isRecord, safeJson, stringValue, type ResolvedActiveGeneration } from "./shared.js";

/**
 * Projects public local-service and telemetry runtime evidence without private provider internals.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Redacted runtime metadata.
 */
export function projectRuntimeMetadata(
  generation: ResolvedActiveGeneration,
): Record<string, JsonValue> {
  const localServices = projectLocalServices(generation.localServices);
  const telemetry = projectTelemetry(generation.telemetry);
  return {
    ...(localServices === undefined ? {} : { localServices }),
    ...(telemetry === undefined ? {} : { telemetry }),
  };
}

/**
 * Selects local-service health, phase, lease and recipe evidence.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public local-service records in stable order.
 */
function projectLocalServices(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const plan = isRecord(value.plan) ? value.plan : undefined;
  const runtime = isRecord(value.runtime) ? value.runtime : undefined;
  const state = runtime && isRecord(runtime.state) ? runtime.state : undefined;
  const lease = runtime && isRecord(runtime.lease) ? safeLease(runtime.lease) : undefined;
  const stateByBinding = new Map(
    (Array.isArray(state?.services) ? state.services : []).flatMap((entry) =>
      isRecord(entry) && stringValue(entry.bindingId) !== undefined
        ? [[entry.bindingId as string, entry] as const]
        : [],
    ),
  );
  const items = (Array.isArray(plan?.services) ? plan.services : []).flatMap((entry) => {
    if (!isRecord(entry) || stringValue(entry.bindingId) === undefined) return [];
    const active = stateByBinding.get(entry.bindingId as string);
    return [
      safeJson({
        bindingId: entry.bindingId,
        capability: stringValue(entry.capability) ?? "unknown",
        profile: stringValue(entry.profile) ?? "default",
        materializerId: stringValue(entry.materializerId) ?? "unknown",
        ...(safeRecipe(entry.recipe) === undefined ? {} : { recipe: safeRecipe(entry.recipe) }),
        requiredBy: strings(entry.requiredBy),
        phase: safePhase(active?.phase) ?? "planned",
        ...(stringValue(active?.message) === undefined ? {} : { message: active?.message }),
      }),
    ];
  });
  return safeJson({
    ...(stringValue(state?.applicationId) === undefined
      ? {}
      : { applicationId: state?.applicationId }),
    ...(stringValue(state?.planHash) === undefined ? {} : { planHash: state?.planHash }),
    ...(lease === undefined ? {} : { lease }),
    items,
  });
}

/**
 * Selects telemetry state, bounded counters and declared exporter metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public telemetry evidence without credentials or endpoints.
 */
function projectTelemetry(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const sampling = isRecord(value.sampling) ? value.sampling : {};
  const counters = isRecord(value.counters) ? value.counters : {};
  const exporters = Array.isArray(value.exporters) ? value.exporters : [];
  return safeJson({
    sampling: {
      traceRate: rate(sampling.traceRate) ?? 1,
      minimumLogLevel: logLevel(sampling.minimumLogLevel) ?? "info",
      errors: "always",
      diagnostics: "always",
    },
    counters: numericFields(counters),
    exporters: exporters.flatMap((entry) => safeExporter(entry)).sort(byName),
  });
}

/**
 * Selects safe exporter identity and admission metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted public exporter evidence.
 */
function safeExporter(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value) || stringValue(value.name) === undefined) return [];
  return [
    {
      name: value.name,
      integrationId: stringValue(value.integrationId) ?? "unknown",
      adapterId: stringValue(value.adapterId) ?? "unknown",
      healthy: value.healthy === true,
      ...numericFields(value),
    },
  ];
}

/**
 * Selects finite nonnegative counters from the declared field set.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Only accepted public numeric counters.
 */
function numericFields(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    [
      "persisted",
      "streamed",
      "exportSelected",
      "sampledOut",
      "severityFiltered",
      "exportFailures",
      "received",
      "selected",
      "exported",
      "failures",
      "queuedRecords",
      "queuedUnits",
      "droppedRecords",
      "droppedUnits",
    ].flatMap((key) =>
      nonnegative(value[key]) === undefined ? [] : [[key, nonnegative(value[key])!]],
    ),
  );
}

/**
 * Selects public lease ownership and expiration metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted lease evidence.
 */
function safeLease(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const mode = value.mode === "attached" || value.mode === "detached" ? value.mode : undefined;
  const status = ["acquired", "adopted", "recovered", "blocked"].includes(String(value.status))
    ? value.status
    : undefined;
  return mode === undefined && status === undefined
    ? undefined
    : { ...(mode ? { mode } : {}), ...(status ? { status } : {}) };
}

/**
 * Selects public local-service recipe metadata without native configuration values.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A public recipe declaration.
 */
function safeRecipe(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const integrationId = stringValue(value.integrationId);
  const recipeId = stringValue(value.recipeId);
  const recipeVersion = nonnegative(value.recipeVersion);
  return integrationId && recipeId && recipeVersion && recipeVersion > 0
    ? { integrationId, recipeId, recipeVersion }
    : undefined;
}

/**
 * Selects local-service phase and bounded failure metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public phase evidence.
 */
function safePhase(value: unknown): string | undefined {
  return ["pending", "starting", "healthy", "unhealthy", "stopped", "planned"].includes(
    String(value),
  )
    ? String(value)
    : undefined;
}

/**
 * Accepts only stored string metadata from the selected collection.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The accepted string values.
 */
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

/**
 * Validates public telemetry sampling rates within the unit interval.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted sampling rate or undefined.
 */
function rate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

/**
 * Accepts only the established public severity vocabulary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A public log severity or undefined.
 */
function logLevel(value: unknown): string | undefined {
  return ["trace", "debug", "info", "warn", "error", "fatal"].includes(String(value))
    ? String(value)
    : undefined;
}

/**
 * Accepts only finite nonnegative numeric evidence.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted numeric value or undefined.
 */
function nonnegative(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

/**
 * Orders projected metadata using its declared public name.
 * @param left - First projected value in the stable ordering.
 * @param right - Second projected value in the stable ordering.
 * @returns The stable public-name comparison result.
 */
function byName(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(left.name).localeCompare(String(right.name));
}
