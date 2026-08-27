import type {
  AgentTurnRecord,
  InvocationRecord,
  ObservabilityRecord,
  ResourceRecord,
  SpanRecord,
  ToolRecord,
} from "./model.js";
import type { RequestDetailInput, RequestRecordBuilder } from "./request-record.js";

/** Adds completed correlated child signals to the request timeline in collector order. */
export function appendObservedRequestDetails(
  builder: RequestRecordBuilder,
  records: readonly ObservabilityRecord[],
  requestId: string,
  traceId: string,
): void {
  const root = records.find(
    (record): record is InvocationRecord =>
      record.signal === "invocation" &&
      record.traceId === traceId &&
      correlatedRequest(record, requestId) &&
      record.source === "http" &&
      record.parentId === undefined &&
      record.status !== "started",
  );
  if (root !== undefined) builder.setInvocationId(root.id);
  for (const record of records) {
    if (!matches(record, requestId, traceId)) continue;
    const detail = detailFor(record, root?.id);
    if (detail !== undefined) builder.add(detail);
  }
}

function detailFor(
  record: ObservabilityRecord,
  rootId: string | undefined,
): RequestDetailInput | undefined {
  switch (record.signal) {
    case "invocation":
      if (record.id === rootId || record.status === "started" || record.parentId === undefined)
        return undefined;
      return detail({
        kind: "child",
        at: record.completedAt ?? record.startedAt,
        targetId: record.functionId,
        outcome: record.status === "provider-failure" ? "provider-failure" : record.status,
        durationMs: record.durationMs,
      });
    case "resource":
      return resourceDetail(record);
    case "job":
      return detail({
        kind: "job",
        at: record.completedAt ?? record.startedAt ?? record.acceptedAt,
        targetId: record.jobId,
        outcome: record.errorId === undefined ? "success" : "provider-failure",
        durationMs: record.durationMs,
      });
    case "event":
      return detail({
        kind: "event",
        at: record.completedAt ?? record.occurredAt,
        targetId: record.eventId,
        outcome: record.errorId === undefined ? "success" : "provider-failure",
        durationMs: record.durationMs,
      });
    case "tool":
      return toolDetail(record);
    case "agent":
      return record.kind === "tool" ? agentToolDetail(record) : undefined;
    case "span":
      return spanDetail(record);
    default:
      return undefined;
  }
}

function resourceDetail(record: ResourceRecord): RequestDetailInput {
  return detail({
    kind: "resource",
    at: record.completedAt ?? record.startedAt,
    targetId: record.resourceId,
    outcome: normalizeOutcome(record.outcome),
    durationMs: record.durationMs,
  });
}

function toolDetail(record: ToolRecord): RequestDetailInput {
  return detail({
    kind: "tool",
    at: record.completedAt ?? record.startedAt,
    targetId: record.toolId,
    outcome: normalizeOutcome(record.outcome),
    durationMs: record.durationMs,
  });
}

function agentToolDetail(record: AgentTurnRecord): RequestDetailInput {
  return detail({
    kind: "tool",
    at: record.completedAt ?? record.startedAt,
    targetId: record.toolId ?? record.agentId,
    outcome: normalizeOutcome(record.outcome === "success" ? "success" : "defect"),
  });
}

function spanDetail(record: SpanRecord): RequestDetailInput | undefined {
  if (record.status !== "completed") return undefined;
  const match = /^(?:relkit\.)?(bucket|cache|job|event|tool|agent)\.([^\.]+)(?:\.|$)/.exec(
    record.name,
  );
  if (match === null) return undefined;
  const kind: RequestDetailInput["kind"] =
    match[1] === "bucket" || match[1] === "cache"
      ? "resource"
      : match[1] === "tool" || match[1] === "agent"
        ? "tool"
        : match[1] === "job"
          ? "job"
          : "event";
  return detail({
    kind,
    at: record.completedAt ?? record.startedAt,
    targetId: match[2],
    outcome: normalizeOutcome(record.outcome),
    durationMs: record.durationMs,
  });
}

function detail(value: {
  readonly kind: RequestDetailInput["kind"];
  readonly at: string;
  readonly targetId?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly outcome?: RequestDetailInput["outcome"] | undefined;
}): RequestDetailInput {
  return {
    kind: value.kind,
    at: value.at,
    ...(value.targetId === undefined ? {} : { targetId: value.targetId }),
    ...(value.durationMs === undefined ? {} : { durationMs: value.durationMs }),
    ...(value.outcome === undefined ? {} : { outcome: value.outcome }),
  };
}

function normalizeOutcome(value: string | undefined): RequestDetailInput["outcome"] | undefined {
  if (value === undefined) return undefined;
  if (
    value === "success" ||
    value === "declared-error" ||
    value === "validation-error" ||
    value === "timeout" ||
    value === "cancelled" ||
    value === "defect" ||
    value === "provider-failure"
  )
    return value;
  return "defect";
}

function matches(record: ObservabilityRecord, requestId: string, traceId: string): boolean {
  return record.traceId === traceId && correlatedRequest(record, requestId);
}

function correlatedRequest(record: ObservabilityRecord, requestId: string): boolean {
  const value = record.requestId ?? record.correlationId;
  return value === undefined || value === requestId;
}
