import { createHash } from "node:crypto";
import type { LogLevel, ObservabilityRecord } from "./model.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExportSamplingPolicy } from "./telemetry-config.js";

export type TelemetryExportDecision = "export" | "sampled-out" | "severity-filtered";
export type TelemetryExportRecord = (
  record: RedactedObservabilityRecord,
  decision: TelemetryExportDecision,
) => void | Promise<void>;

const logLevels: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

/** Selects one trace identity deterministically so every related record inherits the result. */
export function traceIsSampled(traceId: string, rate = 1): boolean {
  if (typeof traceId !== "string" || traceId === "")
    throw new TypeError("Telemetry trace ID must be non-empty text");
  if (!Number.isFinite(rate) || rate < 0 || rate > 1)
    throw new RangeError("Telemetry trace sample rate must be between 0 and 1");
  if (rate === 0) return false;
  if (rate === 1) return true;
  const value = createHash("sha256").update(traceId).digest().readUInt32BE(0);
  return value / 0x1_0000_0000 < rate;
}

export function telemetryExportDecision(
  record: ObservabilityRecord,
  policy: TelemetryExportSamplingPolicy = {},
): TelemetryExportDecision {
  if (record.signal === "diagnostic" || isTelemetryError(record)) return "export";
  if (record.signal === "log")
    return logLevelEnabled(record.level, policy.minimumLogLevel ?? "info")
      ? "export"
      : "severity-filtered";
  if (
    record.traceId !== undefined &&
    record.signal !== "generation" &&
    !traceIsSampled(record.traceId, policy.traceRate)
  )
    return "sampled-out";
  return "export";
}

export function isTelemetryError(record: ObservabilityRecord): boolean {
  if ("errorId" in record && typeof record.errorId === "string") return true;
  if (record.signal === "log") return record.level === "error" || record.level === "fatal";
  if (record.signal === "request") return record.outcome !== "success";
  if (record.signal === "invocation")
    return record.status !== "started" && record.status !== "success";
  if (record.signal === "job") return record.state === "dead-lettered";
  if (record.signal === "event")
    return record.state === "failed" || record.state === "dead-lettered";
  if (record.signal === "resource" || record.signal === "tool") return record.outcome !== "success";
  if (record.signal === "agent")
    return record.outcome !== undefined && record.outcome !== "success";
  if (record.signal === "span" || record.signal === "trace")
    return record.outcome !== undefined && record.outcome !== "success";
  return record.signal === "generation" && record.event === "failed";
}

function logLevelEnabled(level: LogLevel, minimum: LogLevel): boolean {
  return logLevels.indexOf(level) >= logLevels.indexOf(minimum);
}
