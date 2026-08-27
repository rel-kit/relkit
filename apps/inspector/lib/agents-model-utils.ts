import type { InspectorGraph, InspectorObject } from "./api-types";
import type { SpanView, TimelineEntry, ToolApprovalView, ToolRuntimeView } from "./agents-model";

export function runtimeView(
  value: InspectorObject,
  fallbackId: string,
): ToolRuntimeView | undefined {
  const id = text(value.toolId) || text(value.agentId) || text(value.id) || fallbackId;
  if (id === "") return undefined;
  const result: Record<string, unknown> = { id };
  for (const key of [
    "invocationId",
    "toolCallId",
    "traceId",
    "requestId",
    "status",
    "state",
    "outcome",
    "startedAt",
    "completedAt",
  ]) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  if (number(value.durationMs) !== undefined) result.durationMs = number(value.durationMs);
  const approval = approvalView(value, id);
  if (approval !== undefined) result.approval = approval;
  return result as unknown as ToolRuntimeView;
}

function approvalView(
  value: InspectorObject,
  fallbackToolId: string,
): ToolApprovalView | undefined {
  const nested = record(value.approval);
  const state = text(nested?.state) || text(value.approval);
  if (state !== "pending" && state !== "approved" && state !== "denied") return undefined;
  const invocationId = text(nested?.invocationId) || text(value.invocationId);
  const toolCallId = text(nested?.toolCallId) || text(value.toolCallId);
  if (invocationId === "" || toolCallId === "") return undefined;
  return {
    invocationId,
    toolCallId,
    toolId: text(nested?.toolId) || text(value.toolId) || fallbackToolId,
    state,
    ...(text(nested?.sideEffect) || text(value.sideEffect)
      ? { sideEffect: text(nested?.sideEffect) || text(value.sideEffect) }
      : {}),
    ...(text(nested?.policy) || text(value.policy)
      ? { policy: text(nested?.policy) || text(value.policy) }
      : {}),
    ...(typeof nested?.required === "boolean"
      ? { required: nested.required }
      : typeof value.required === "boolean"
        ? { required: value.required }
        : {}),
  };
}

export function spanView(value: InspectorObject): SpanView | undefined {
  const spanId = text(value.spanId) || text(value.turnId);
  if (spanId === "") return undefined;
  const name = text(value.name);
  const kind =
    value.kind === "model" || value.kind === "tool" || value.kind === "agent"
      ? value.kind
      : name.includes(".model")
        ? "model"
        : name.includes(".tool.")
          ? "tool"
          : "agent";
  const attributes = record(value.attributes);
  return {
    kind,
    spanId,
    ...(text(value.invocationId) ? { invocationId: text(value.invocationId) } : {}),
    ...(name ? { name } : {}),
    ...(text(value.agentId) ? { agentId: text(value.agentId) } : {}),
    ...(text(value.functionId) ? { functionId: text(value.functionId) } : {}),
    ...(text(value.traceId) ? { traceId: text(value.traceId) } : {}),
    ...(text(value.parentSpanId) ? { parentSpanId: text(value.parentSpanId) } : {}),
    ...(text(value.toolId) || text(attributes?.["relkit.tool.id"])
      ? { toolId: text(value.toolId) || text(attributes?.["relkit.tool.id"]) }
      : {}),
    ...(text(value.toolCallId) || text(attributes?.["relkit.tool.call.id"])
      ? { toolCallId: text(value.toolCallId) || text(attributes?.["relkit.tool.call.id"]) }
      : {}),
    ...(text(value.profile) || text(attributes?.["relkit.model.profile"])
      ? { profile: text(value.profile) || text(attributes?.["relkit.model.profile"]) }
      : {}),
    ...(number(value.step) === undefined && number(attributes?.["relkit.agent.step"]) === undefined
      ? {}
      : { step: number(value.step) ?? number(attributes?.["relkit.agent.step"]) }),
    ...(text(value.status) ? { status: text(value.status) } : {}),
    ...(text(value.outcome) ? { outcome: text(value.outcome) } : {}),
    ...(text(value.startedAt) ? { startedAt: text(value.startedAt) } : {}),
    ...(text(value.completedAt) ? { completedAt: text(value.completedAt) } : {}),
    ...(number(value.durationMs) === undefined ? {} : { durationMs: number(value.durationMs) }),
    ...(number(value.inputBytes) === undefined ? {} : { inputBytes: number(value.inputBytes) }),
    ...(number(value.outputBytes) === undefined ? {} : { outputBytes: number(value.outputBytes) }),
  };
}

export function timeline(
  runtime: readonly ToolRuntimeView[],
  spans: readonly SpanView[],
): readonly TimelineEntry[] {
  const entries = [
    ...runtime.flatMap((item) => {
      const at = text(item.startedAt) || text(item.completedAt);
      return at === ""
        ? []
        : [{ kind: "invocation" as const, id: item.id, at, ...safeState(item) }];
    }),
    ...spans.flatMap((span) => {
      const at = text(span.startedAt) || text(span.completedAt);
      return at === "" ? [] : [{ kind: span.kind, id: span.spanId, at, ...safeState(span) }];
    }),
  ];
  return entries.sort(
    (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
  );
}

function safeState(value: ToolRuntimeView | SpanView): Pick<TimelineEntry, "status" | "outcome"> {
  return {
    ...(text(value.status) ? { status: text(value.status) } : {}),
    ...(text(value.outcome) ? { outcome: text(value.outcome) } : {}),
  };
}

export function graphNodes(graph: InspectorGraph): readonly InspectorObject[] {
  const nested = record(graph.graph);
  return records(graph.nodes ?? nested?.nodes);
}

function records(value: unknown): InspectorObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function record(value: unknown): InspectorObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
