import { isStableId } from "@relkit/contracts";

const signals = new Set([
  "request",
  "invocation",
  "job",
  "event",
  "resource",
  "tool",
  "agent",
  "log",
  "span",
  "trace",
  "diagnostic",
  "generation",
]);

export function validateTelemetryConfiguration(
  value: unknown,
  index: number,
  fail: (message: string) => never,
): void {
  if (value === undefined) return;
  if (!record(value)) fail(`Graph nodes[${index}].telemetry is invalid.`);
  exact(
    value,
    ["capture", "redaction", "localRetention", "exportSampling", "exporters"],
    index,
    fail,
  );
  if (value.capture !== undefined) validateCapture(value.capture, index, fail);
  if (value.redaction !== undefined) validateRedaction(value.redaction, index, fail);
  if (value.localRetention !== undefined)
    validatePositiveMap(
      value.localRetention,
      ["maxRecords", "maxAgeMs", "maxBytes", "maxEntries"],
      index,
      "localRetention",
      fail,
    );
  if (value.exportSampling !== undefined) validateSampling(value.exportSampling, index, fail);
  if (value.exporters !== undefined) validateExporters(value.exporters, index, fail);
}

function validateCapture(value: unknown, index: number, fail: (message: string) => never): void {
  if (!record(value)) fail(`Graph nodes[${index}].telemetry.capture is invalid.`);
  exact(value, ["signals"], index, fail);
  if (
    value.signals !== undefined &&
    (!Array.isArray(value.signals) || value.signals.some((signal) => !signals.has(String(signal))))
  )
    fail(`Graph nodes[${index}].telemetry.capture.signals is invalid.`);
}

function validateRedaction(value: unknown, index: number, fail: (message: string) => never): void {
  if (!record(value)) fail(`Graph nodes[${index}].telemetry.redaction is invalid.`);
  exact(value, ["mode", "maxBytes", "redactKeys"], index, fail);
  if (value.mode !== undefined && value.mode !== "off" && value.mode !== "development-redacted")
    fail(`Graph nodes[${index}].telemetry.redaction.mode is invalid.`);
  if (
    value.maxBytes !== undefined &&
    (!Number.isSafeInteger(value.maxBytes) || Number(value.maxBytes) < 1)
  )
    fail(`Graph nodes[${index}].telemetry.redaction.maxBytes is invalid.`);
  if (
    value.redactKeys !== undefined &&
    (!Array.isArray(value.redactKeys) ||
      value.redactKeys.some((key) => typeof key !== "string" || key === ""))
  )
    fail(`Graph nodes[${index}].telemetry.redaction.redactKeys is invalid.`);
}

function validateSampling(value: unknown, index: number, fail: (message: string) => never): void {
  if (!record(value)) fail(`Graph nodes[${index}].telemetry.exportSampling is invalid.`);
  exact(value, ["traceRate", "minimumLogLevel"], index, fail);
  if (
    value.traceRate !== undefined &&
    (typeof value.traceRate !== "number" || value.traceRate < 0 || value.traceRate > 1)
  )
    fail(`Graph nodes[${index}].telemetry.exportSampling.traceRate is invalid.`);
  if (
    value.minimumLogLevel !== undefined &&
    !["trace", "debug", "info", "warn", "error", "fatal"].includes(String(value.minimumLogLevel))
  )
    fail(`Graph nodes[${index}].telemetry.exportSampling.minimumLogLevel is invalid.`);
}

function validateExporters(value: unknown, index: number, fail: (message: string) => never): void {
  if (!record(value)) fail(`Graph nodes[${index}].telemetry.exporters is invalid.`);
  for (const [name, exporter] of Object.entries(value)) {
    if (
      !isStableId(name) ||
      !record(exporter) ||
      Reflect.ownKeys(exporter).length !== 5 ||
      exporter.kind !== "telemetry-exporter" ||
      exporter.protocolVersion !== 1 ||
      !isStableId(exporter.integrationId) ||
      !isStableId(exporter.adapterId) ||
      !record(exporter.configuration)
    )
      fail(`Graph nodes[${index}].telemetry.exporters.${name} is invalid.`);
  }
}

function validatePositiveMap(
  value: unknown,
  keys: readonly string[],
  index: number,
  field: string,
  fail: (message: string) => never,
): void {
  if (!record(value)) fail(`Graph nodes[${index}].telemetry.${field} is invalid.`);
  exact(value, keys, index, fail);
  if (Object.values(value).some((entry) => !Number.isSafeInteger(entry) || Number(entry) < 1))
    fail(`Graph nodes[${index}].telemetry.${field} is invalid.`);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  index: number,
  fail: (message: string) => never,
): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail(`Graph nodes[${index}].telemetry contains unknown fields.`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
