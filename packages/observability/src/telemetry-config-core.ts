import { deepFreeze, isStableId, serializeJson } from "@relkit/contracts";
import type { ObservabilitySignal } from "./model.js";
import { redactionCore } from "./redaction-core.js";
import type {
  TelemetryCapturePolicy,
  TelemetryConfiguration,
  TelemetryExporterDescriptor,
  TelemetryExporterMap,
  TelemetryExportSamplingPolicy,
  TelemetryLocalRetentionPolicy,
} from "./telemetry-config.types.js";
import type { RedactionPolicy } from "./redaction.types.js";
export const TELEMETRY_EXPORTER_PROTOCOL_VERSION = 1 as const;
const signals = new Set<ObservabilitySignal>([
  "request",
  "invocation",
  "job",
  "event",
  "operation",
  "tool",
  "agent",
  "log",
  "span",
  "trace",
  "diagnostic",
  "generation",
]);
function defineTelemetryExporter<
  const IntegrationId extends string,
  const AdapterId extends string,
  const Configuration extends object,
>(
  integrationId: IntegrationId,
  adapterId: AdapterId,
  configuration: Configuration,
): TelemetryExporterDescriptor<IntegrationId, AdapterId, Configuration> {
  if (!isStableId(integrationId) || !isStableId(adapterId)) invalid("exporter descriptor");
  return frozen({
    kind: "telemetry-exporter",
    protocolVersion: TELEMETRY_EXPORTER_PROTOCOL_VERSION,
    integrationId,
    adapterId,
    configuration,
  });
}
function normalizeTelemetryConfiguration<Exporters extends TelemetryExporterMap>(
  value: TelemetryConfiguration<Exporters> = {},
): TelemetryConfiguration<Exporters> {
  if (!record(value as unknown)) invalid("configuration");
  exact(value, ["capture", "redaction", "localRetention", "exportSampling", "exporters"]);
  const capture = normalizeCapture(value.capture);
  const redaction = normalizeRedaction(value.redaction);
  const localRetention = normalizeRetention(value.localRetention);
  const exportSampling = normalizeSampling(value.exportSampling);
  const exporters = normalizeExporters(value.exporters);
  return frozen({
    ...(capture === undefined ? {} : { capture }),
    ...(redaction === undefined ? {} : { redaction }),
    ...(localRetention === undefined ? {} : { localRetention }),
    ...(exportSampling === undefined ? {} : { exportSampling }),
    ...(exporters === undefined ? {} : { exporters }),
  }) as unknown as TelemetryConfiguration<Exporters>;
}
function isTelemetryExporterDescriptor(value: unknown): value is TelemetryExporterDescriptor {
  return (
    record(value) &&
    Reflect.ownKeys(value).length === 5 &&
    value.kind === "telemetry-exporter" &&
    value.protocolVersion === TELEMETRY_EXPORTER_PROTOCOL_VERSION &&
    isStableId(value.integrationId) &&
    isStableId(value.adapterId) &&
    record(value.configuration) &&
    serializable(value.configuration)
  );
}
function normalizeCapture(value: TelemetryCapturePolicy | undefined) {
  if (value === undefined) return undefined;
  if (!record(value)) invalid("capture");
  exact(value, ["signals"]);
  if (value.signals === undefined) return {};
  if (!Array.isArray(value.signals) || value.signals.some((signal) => !signals.has(signal)))
    invalid("capture signals");
  return { signals: [...new Set(value.signals)].sort() };
}
function normalizeRedaction(value: RedactionPolicy | undefined) {
  if (value === undefined) return undefined;
  if (!record(value)) invalid("redaction");
  exact(value, ["mode", "maxBytes", "redactKeys"]);
  redactionCore.createRedactionPolicy(value);
  return value;
}
function normalizeRetention(value: TelemetryLocalRetentionPolicy | undefined) {
  if (value === undefined) return undefined;
  if (!record(value)) invalid("local retention");
  exact(value, ["maxRecords", "maxAgeMs", "maxBytes", "maxEntries"]);
  for (const entry of Object.values(value))
    if (!Number.isSafeInteger(entry) || Number(entry) < 1) invalid("local retention");
  return value;
}
function normalizeSampling(value: TelemetryExportSamplingPolicy | undefined) {
  if (value === undefined) return undefined;
  if (!record(value)) invalid("export sampling");
  exact(value, ["traceRate", "minimumLogLevel"]);
  if (
    value.minimumLogLevel !== undefined &&
    (typeof value.minimumLogLevel !== "string" ||
      !["trace", "debug", "info", "warn", "error", "fatal"].includes(value.minimumLogLevel))
  )
    invalid("export minimum log level");
  if (value.traceRate === undefined) return value;
  if (
    typeof value.traceRate !== "number" ||
    !Number.isFinite(value.traceRate) ||
    value.traceRate < 0 ||
    value.traceRate > 1
  )
    invalid("export trace rate");
  return value;
}
function normalizeExporters(value: TelemetryExporterMap | undefined) {
  if (value === undefined) return undefined;
  if (!record(value)) invalid("exporters");
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (
    entries.some(
      ([name, exporter]) => !isStableId(name) || !isTelemetryExporterDescriptor(exporter),
    )
  )
    invalid("exporters");
  return Object.fromEntries(entries);
}
function exact(value: object, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new TypeError(`Unknown telemetry option "${unknown}"`);
}
function serializable(value: unknown): boolean {
  try {
    serializeJson(value);
    return true;
  } catch {
    return false;
  }
}
function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(label: string): never {
  throw new TypeError(`Telemetry ${label} is invalid`);
}
/** Internal configuration rules executed by the observed Effect operations. */
export const telemetryConfigCore = {
  defineTelemetryExporter,
  normalizeTelemetryConfiguration,
  isTelemetryExporterDescriptor,
};
