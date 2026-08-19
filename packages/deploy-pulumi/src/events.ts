import { Effect } from "effect";
import type { EngineEvent, OutputMap, PreviewResult, UpResult } from "@pulumi/pulumi/automation";
import {
  changes,
  finiteNumber,
  nonNegativeInteger,
  redactPulumiOutputs,
  resourceLog,
  safeFields,
  safeText,
  summarizePulumiEvents as summarize,
} from "./events-support.js";
import {
  createOutputReport as buildOutputReport,
  createPreviewReport as buildPreviewReport,
  createUpdateReport as buildUpdateReport,
} from "./events-report.js";
import {
  type PulumiEventLog,
  type PulumiEventOptions,
  type PulumiEventSummary,
  type PulumiOutputReport,
  type PulumiPreviewReport,
  type PulumiUpdateReport,
  type PulumiLogLevel,
} from "./events-types.js";

export {
  PULUMI_REPORT_VERSION,
  type PulumiEventLog,
  type PulumiEventOptions,
  type PulumiEventSummary,
  type PulumiLogLevel,
  type PulumiOutput,
  type PulumiOutputReport,
  type PulumiOutputValue,
  type PulumiOutputs,
  type PulumiPreviewReport,
  type PulumiReport,
  type PulumiSecretOutput,
  type PulumiUpdateReport,
} from "./events-types.js";

/** Converts one Automation API event into safe data suitable for Effect logs. */
export function toPulumiLog(
  event: EngineEvent,
  options: PulumiEventOptions = {},
): PulumiEventLog | undefined {
  const base = (
    kind: string,
    level: PulumiLogLevel,
    message: unknown,
    fields: object = {},
  ): PulumiEventLog =>
    Object.freeze({
      sequence: nonNegativeInteger(event.sequence),
      timestamp: finiteNumber(event.timestamp),
      kind,
      level,
      message: safeText(message, options),
      fields: safeFields({ component: "deploy.pulumi", pulumiEvent: kind, ...fields }, options),
    });
  if (event.cancelEvent) return base("cancel", "warn", "Pulumi operation cancelled");
  if (event.stdoutEvent)
    return base("stdout", "info", event.stdoutEvent.message, { stream: "stdout" });
  if (event.diagnosticEvent) {
    const diagnostic = event.diagnosticEvent;
    const level =
      diagnostic.severity === "error" || diagnostic.severity === "info#err"
        ? "error"
        : diagnostic.severity === "warning"
          ? "warn"
          : "info";
    return base("diagnostic", level, diagnostic.message, {
      severity: diagnostic.severity,
      ...(diagnostic.urn === undefined ? {} : { urn: diagnostic.urn }),
    });
  }
  if (event.preludeEvent)
    return base("prelude", "info", "Pulumi operation started", {
      configurationNames: Object.keys(event.preludeEvent.config).sort(),
    });
  if (event.summaryEvent) {
    const summary = event.summaryEvent;
    return base("summary", summary.maybeCorrupt ? "warn" : "info", "Pulumi operation completed", {
      resourceChanges: changes(summary.resourceChanges),
      durationSeconds: finiteNumber(summary.durationSeconds),
      maybeCorrupt: summary.maybeCorrupt,
    });
  }
  if (event.resourcePreEvent)
    return resourceLog(
      base,
      "resource-pre",
      "Pulumi resource operation started",
      event.resourcePreEvent,
    );
  if (event.resOutputsEvent)
    return resourceLog(
      base,
      "resource-outputs",
      "Pulumi resource operation completed",
      event.resOutputsEvent,
    );
  if (event.resOpFailedEvent)
    return resourceLog(
      base,
      "resource-failed",
      "Pulumi resource operation failed",
      event.resOpFailedEvent,
      { status: event.resOpFailedEvent.status, steps: event.resOpFailedEvent.steps },
    );
  if (event.policyEvent) {
    const policy = event.policyEvent;
    return base(
      "policy",
      policy.enforcementLevel === "mandatory" ? "error" : "warn",
      policy.message,
      {
        enforcement: policy.enforcementLevel,
        policyName: policy.policyName,
        policyPackName: policy.policyPackName,
        ...(policy.resourceUrn === undefined ? {} : { resourceUrn: policy.resourceUrn }),
      },
    );
  }
  if (event.startDebuggingEvent)
    return base("debugging", "info", "Pulumi debugger started", {
      configurationNames: Object.keys(event.startDebuggingEvent.config).sort(),
    });
  return undefined;
}

/** Builds an Effect log with only the already-redacted event message and fields. */
export function toPulumiEffectLog(
  event: EngineEvent,
  options: PulumiEventOptions = {},
): Effect.Effect<void> {
  const log = toPulumiLog(event, options);
  if (log === undefined) return Effect.void;
  const effect =
    log.level === "error"
      ? Effect.logError(log.message)
      : log.level === "warn"
        ? Effect.logWarning(log.message)
        : Effect.logInfo(log.message);
  return effect.pipe(Effect.annotateLogs({ ...log.fields }));
}

/** Adapts the synchronous Automation API callback to an existing Effect runtime/logger. */
export function createPulumiEventLogger(
  emit: (effect: Effect.Effect<void>) => void,
  options: PulumiEventOptions = {},
): (event: EngineEvent) => void {
  return (event) => {
    try {
      emit(toPulumiEffectLog(event, options));
    } catch {
      /* logging must not change deployment */
    }
  };
}

/** Produces a stable summary from event order-independent engine data. */
export function summarizePulumiEvents(events: readonly EngineEvent[]): PulumiEventSummary {
  return summarize(events);
}

export { formatPulumiSummary, serializePulumiReport } from "./events-report.js";

export function createPreviewReport(
  result: Pick<PreviewResult, "changeSummary">,
  events: readonly EngineEvent[] = [],
  options: PulumiEventOptions = {},
): PulumiPreviewReport {
  return buildPreviewReport(result, events, (event) => toPulumiLog(event, options));
}

export function createUpdateReport(
  result: Pick<UpResult, "summary" | "outputs">,
  events: readonly EngineEvent[] = [],
  options: PulumiEventOptions = {},
): PulumiUpdateReport {
  return buildUpdateReport(result, events, (event) => toPulumiLog(event, options), options);
}

export function createOutputReport(
  outputs: OutputMap,
  options: PulumiEventOptions = {},
): PulumiOutputReport {
  return buildOutputReport(outputs, options);
}

export { redactPulumiOutputs };
