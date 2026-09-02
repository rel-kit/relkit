import type { JsonValue } from "@relkit/contracts";
import { isRecord, safeJson, stringValue, type ResolvedActiveGeneration } from "./shared.js";

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

function safeLease(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const mode = value.mode === "attached" || value.mode === "detached" ? value.mode : undefined;
  const status = ["acquired", "adopted", "recovered", "blocked"].includes(String(value.status))
    ? value.status
    : undefined;
  return mode === undefined && status === undefined
    ? undefined
    : { ...(mode ? { mode } : {}), ...(status ? { status } : {}) };
}

function safeRecipe(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const integrationId = stringValue(value.integrationId);
  const recipeId = stringValue(value.recipeId);
  const recipeVersion = nonnegative(value.recipeVersion);
  return integrationId && recipeId && recipeVersion && recipeVersion > 0
    ? { integrationId, recipeId, recipeVersion }
    : undefined;
}

function safePhase(value: unknown): string | undefined {
  return ["pending", "starting", "healthy", "unhealthy", "stopped", "planned"].includes(
    String(value),
  )
    ? String(value)
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function rate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function logLevel(value: unknown): string | undefined {
  return ["trace", "debug", "info", "warn", "error", "fatal"].includes(String(value))
    ? String(value)
    : undefined;
}

function nonnegative(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function byName(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(left.name).localeCompare(String(right.name));
}
