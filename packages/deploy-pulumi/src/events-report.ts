import type { EngineEvent, OutputMap, PreviewResult, UpResult } from "@pulumi/pulumi/automation";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type {
  PulumiEventLog,
  PulumiEventOptions,
  PulumiOutputReport,
  PulumiPreviewReport,
  PulumiReport,
  PulumiUpdateReport,
} from "./events-types.js";
import { PULUMI_REPORT_VERSION } from "./events-types.js";
import {
  changes,
  eventLogs,
  redactPulumiOutputs,
  safeFields,
  safeText,
  summarizePulumiEvents,
} from "./events-support.js";

export function formatPulumiSummary(
  summary: PulumiPreviewReport["summary"],
  operation = "preview",
): string {
  const c = summary.resourceChanges;
  const replace = (c.replace ?? 0) + (c["create-replacement"] ?? 0) + (c["delete-replaced"] ?? 0);
  return `Pulumi ${operation}: create=${c.create ?? 0} update=${c.update ?? 0} delete=${c.delete ?? 0} replace=${replace} same=${c.same ?? 0} diagnostics=${summary.diagnostics.error}e/${summary.diagnostics.warning}w/${summary.diagnostics.info}i`;
}

export function createPreviewReport(
  result: Pick<PreviewResult, "changeSummary">,
  events: readonly EngineEvent[],
  toLog: (event: EngineEvent) => PulumiEventLog | undefined,
): PulumiPreviewReport {
  return Object.freeze({
    version: PULUMI_REPORT_VERSION,
    kind: "preview",
    summary: { ...summarizePulumiEvents(events), resourceChanges: changes(result.changeSummary) },
    logs: eventLogs(events, toLog),
  });
}

export function createUpdateReport(
  result: Pick<UpResult, "summary" | "outputs">,
  events: readonly EngineEvent[],
  toLog: (event: EngineEvent) => PulumiEventLog | undefined,
  options: PulumiEventOptions,
): PulumiUpdateReport {
  const eventSummary = summarizePulumiEvents(events);
  return Object.freeze({
    version: PULUMI_REPORT_VERSION,
    kind: "update",
    summary: {
      ...eventSummary,
      resourceChanges: changes(result.summary.resourceChanges),
      durationSeconds: eventSummary.durationSeconds ?? 0,
      result: result.summary.result,
    },
    outputs: redactPulumiOutputs(result.outputs, options),
    logs: eventLogs(events, toLog),
  });
}

export function createOutputReport(
  outputs: OutputMap,
  options: PulumiEventOptions,
): PulumiOutputReport {
  return Object.freeze({
    version: PULUMI_REPORT_VERSION,
    kind: "outputs",
    outputs: redactPulumiOutputs(outputs, options),
  });
}

export function serializePulumiReport(
  report: PulumiReport,
  options: PulumiEventOptions = {},
): string {
  const summary = report.kind === "outputs" ? undefined : serializeSummary(report.summary);
  const logs =
    report.kind === "preview" || report.kind === "update"
      ? report.logs.map((log) => serializeLog(log, options))
      : undefined;
  const outputs =
    report.kind === "preview" ? undefined : redactPulumiOutputs(report.outputs, options);
  return canonicalJson({
    version: report.version,
    kind: report.kind,
    ...(summary === undefined ? {} : { summary }),
    ...(outputs === undefined ? {} : { outputs }),
    ...(logs === undefined ? {} : { logs }),
  } as unknown as JsonValue);
}

function serializeSummary(summary: PulumiPreviewReport["summary"]): JsonValue {
  return {
    resourceChanges: changes(summary.resourceChanges),
    diagnostics: summary.diagnostics,
    maybeCorrupt: summary.maybeCorrupt,
    ...(summary.durationSeconds === undefined ? {} : { durationSeconds: summary.durationSeconds }),
    ...(summary.result === undefined ? {} : { result: summary.result }),
  } as unknown as JsonValue;
}

function serializeLog(log: PulumiEventLog, options: PulumiEventOptions): JsonValue {
  return {
    sequence: log.sequence,
    timestamp: log.timestamp,
    kind: safeText(log.kind, options),
    level: log.level,
    message: safeText(log.message, options),
    fields: safeFields(log.fields, options),
  } as unknown as JsonValue;
}
