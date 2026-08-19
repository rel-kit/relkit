import type { EngineEvent, OpMap, OpType, OutputMap } from "@pulumi/pulumi/automation";
import { redactRecord } from "@zsys/observability";
import { canonicalJson, type JsonValue } from "@zsys/contracts";
import type {
  PulumiEventLog,
  PulumiEventOptions,
  PulumiEventSummary,
  PulumiOutputValue,
  PulumiOutputs,
} from "./events-types.js";

export const OP_TYPES: readonly OpType[] = [
  "same",
  "create",
  "update",
  "delete",
  "replace",
  "create-replacement",
  "delete-replaced",
  "read",
  "read-replacement",
  "refresh",
  "discard",
  "discard-replaced",
  "remove-pending-replace",
  "import",
  "import-replacement",
];

export function changes(value: OpMap | undefined): OpMap {
  const result: Record<string, number> = {};
  for (const key of OP_TYPES) {
    const count = value?.[key];
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) result[key] = count;
  }
  return result as OpMap;
}

export function safeValue(value: unknown, options: PulumiEventOptions): JsonValue {
  return options.redact ? options.redact(value) : redactRecord(value, options.redaction);
}

export function safeFields(
  value: object,
  options: PulumiEventOptions,
): Readonly<Record<string, JsonValue>> {
  const safe = safeValue(value, options);
  return safe !== null && typeof safe === "object" && !Array.isArray(safe)
    ? (safe as Record<string, JsonValue>)
    : {};
}

export function safeText(value: unknown, options: PulumiEventOptions): string {
  const safe = safeValue(value, options);
  return typeof safe === "string" ? safe : "[unavailable]";
}

export function resourceLog(
  base: (kind: string, level: "info" | "error", message: string, fields?: object) => PulumiEventLog,
  kind: string,
  message: string,
  event: {
    readonly metadata: {
      readonly op: OpType;
      readonly urn: string;
      readonly type: string;
      readonly logical?: boolean;
    };
  },
  extra: object = {},
): PulumiEventLog {
  return base(kind, kind === "resource-failed" ? "error" : "info", message, {
    operation: event.metadata.op,
    resourceType: event.metadata.type,
    urn: event.metadata.urn,
    logical: event.metadata.logical ?? false,
    ...extra,
  });
}

export function eventLogs(
  events: readonly EngineEvent[],
  toLog: (event: EngineEvent) => PulumiEventLog | undefined,
): readonly PulumiEventLog[] {
  return Object.freeze(
    events
      .map(toLog)
      .filter((value): value is PulumiEventLog => value !== undefined)
      .sort(
        (left, right) =>
          left.sequence - right.sequence ||
          left.kind.localeCompare(right.kind) ||
          canonicalJson(left).localeCompare(canonicalJson(right)),
      ),
  );
}

export function summarizePulumiEvents(events: readonly EngineEvent[]): PulumiEventSummary {
  const summaries = events
    .filter((event) => event.summaryEvent !== undefined)
    .sort(
      (left, right) =>
        nonNegativeInteger(left.sequence) - nonNegativeInteger(right.sequence) ||
        finiteNumber(left.timestamp) - finiteNumber(right.timestamp) ||
        canonicalJson(left.summaryEvent).localeCompare(canonicalJson(right.summaryEvent)),
    );
  const summary = summaries.at(-1)?.summaryEvent;
  const diagnostics = { info: 0, warning: 0, error: 0 };
  const counted: Record<string, number> = {};
  for (const event of events) {
    if (event.resourcePreEvent) {
      const op = event.resourcePreEvent.metadata.op;
      counted[op] = (counted[op] ?? 0) + 1;
    }
    const severity = event.diagnosticEvent?.severity;
    if (severity === "error" || severity === "info#err") diagnostics.error += 1;
    else if (severity === "warning") diagnostics.warning += 1;
    else if (severity === "info") diagnostics.info += 1;
  }
  return Object.freeze({
    resourceChanges: summary ? changes(summary.resourceChanges) : changes(counted as OpMap),
    diagnostics: Object.freeze(diagnostics),
    maybeCorrupt: summary?.maybeCorrupt ?? false,
    ...(summary === undefined ? {} : { durationSeconds: finiteNumber(summary.durationSeconds) }),
  });
}

export function redactPulumiOutputs(
  outputs: OutputMap | PulumiOutputs,
  options: PulumiEventOptions,
): PulumiOutputs {
  const result: Record<string, PulumiOutputValue> = {};
  for (const name of Object.keys(outputs).sort()) {
    const output = outputs[name];
    result[name] =
      output !== null && typeof output === "object" && output.secret === true
        ? { secret: true }
        : { secret: false, value: safeValue(output?.value, options) };
  }
  return Object.freeze(result);
}

export function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function nonNegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;
}
