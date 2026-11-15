/**
 * Telemetry export counters, named by what they count (IN-18). Without a configured exporter
 * nothing is exported, so no export counter is shown.
 */
import type { InspectorObject } from "./api-types";

export interface ExportCounter {
  readonly label: string;
  readonly value: string;
  readonly tone?: "danger";
}

export function exportCounters(telemetry: InspectorObject | undefined): readonly ExportCounter[] {
  const exporters = Array.isArray(telemetry?.exporters) ? telemetry.exporters : [];
  if (exporters.length === 0) return [];
  const counters = record(telemetry?.counters);
  const failures = count(counters?.exportFailures) ?? 0;
  const rejections = count(counters?.exportCapacityRejections);
  return [
    { label: "Accepted by app capture", value: text(count(counters?.persisted) ?? 0) },
    { label: "Not selected for export by sampling", value: text(count(counters?.sampledOut) ?? 0) },
    {
      label: "Exporter calls that failed",
      value: text(failures),
      ...(failures > 0 ? { tone: "danger" as const } : {}),
    },
    ...(rejections === undefined
      ? []
      : [
          {
            label: "Not exported: export queue full",
            value: text(rejections),
            ...(rejections > 0 ? { tone: "danger" as const } : {}),
          },
        ]),
  ];
}

function text(value: number): string {
  return value.toLocaleString("en-US");
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
