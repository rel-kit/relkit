import type { InspectorGraph, InspectorObject } from "./api-types";
import {
  graphNodes,
  number,
  record,
  runtimeView,
  spanView,
  strings,
  text,
  timeline,
} from "./agents-model-utils";

export interface ToolApprovalView {
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly toolId: string;
  readonly state: "pending" | "approved" | "denied";
  readonly sideEffect?: string;
  readonly policy?: string;
  readonly required?: boolean;
}
export interface ToolRuntimeView {
  readonly id: string;
  readonly invocationId?: string;
  readonly toolCallId?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly status?: string;
  readonly state?: string;
  readonly outcome?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly approval?: ToolApprovalView;
}
export interface SpanView {
  readonly kind: "agent" | "model" | "tool";
  readonly spanId: string;
  readonly invocationId?: string;
  readonly name?: string;
  readonly agentId?: string;
  readonly functionId?: string;
  readonly traceId?: string;
  readonly parentSpanId?: string;
  readonly toolId?: string;
  readonly toolCallId?: string;
  readonly profile?: string;
  readonly step?: number;
  readonly status?: string;
  readonly outcome?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
}
export interface TimelineEntry {
  readonly kind: "invocation" | "agent" | "model" | "tool";
  readonly id: string;
  readonly at: string;
  readonly status?: string;
  readonly outcome?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly toolId?: string;
}
export interface ToolView {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly description: string;
  readonly sideEffect: string;
  readonly approvalPolicy: string;
  readonly timeoutMs?: number;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errors?: unknown;
  readonly runtime: readonly ToolRuntimeView[];
  readonly pendingApprovals: readonly ToolApprovalView[];
  readonly spans: readonly SpanView[];
  readonly timeline: readonly TimelineEntry[];
}
export interface AgentView {
  readonly id: string;
  readonly model: string;
  readonly limits?: unknown;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly toolIds: readonly string[];
  readonly generatedFunctionId: string;
  readonly runtime: readonly ToolRuntimeView[];
  readonly spans: readonly SpanView[];
  readonly timeline: readonly TimelineEntry[];
}
export function toolViews(
  graph: InspectorGraph,
  runtime: readonly InspectorObject[] = [],
  spans: readonly InspectorObject[] = [],
): readonly ToolView[] {
  return graphNodes(graph)
    .filter((node) => node.kind === "tool")
    .map((node) => makeToolView(node, graphNodes(graph), runtime, spans))
    .sort((left, right) => left.id.localeCompare(right.id));
}
export function toolView(
  graph: InspectorGraph,
  runtime: readonly InspectorObject[],
  id: string,
  spans: readonly InspectorObject[] = [],
): ToolView | undefined {
  return toolViews(graph, runtime, spans).find((view) => view.id === id);
}
export function agentViews(
  graph: InspectorGraph,
  runtime: readonly InspectorObject[] = [],
  spans: readonly InspectorObject[] = [],
): readonly AgentView[] {
  return graphNodes(graph)
    .filter((node) => node.kind === "agent")
    .map((node) => makeAgentView(node, runtime, spans))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function agentView(
  graph: InspectorGraph,
  runtime: readonly InspectorObject[],
  id: string,
  spans: readonly InspectorObject[] = [],
): AgentView | undefined {
  return agentViews(graph, runtime, spans).find((view) => view.id === id);
}
function makeToolView(
  node: InspectorObject,
  nodes: readonly InspectorObject[],
  runtime: readonly InspectorObject[],
  spans: readonly InspectorObject[],
): ToolView {
  const id = text(node.id) || "unknown-tool";
  const targetFunctionId = text(node.targetFunctionId);
  const target = nodes.find(
    (candidate) => candidate.kind === "function" && text(candidate.id) === targetFunctionId,
  );
  const runtimeViews = runtime.flatMap((item) => {
    if (text(item.toolId) !== id && text(item.id) !== id) return [];
    const value = runtimeView(item, id);
    return value === undefined || value.id !== id ? [] : [value];
  });
  const approval = runtimeViews.flatMap((item) =>
    item.approval?.state === "pending" ? [item.approval] : [],
  );
  const spanViews = spans.flatMap((item) => {
    const value = spanView(item);
    return value === undefined ? [] : [value];
  });
  return {
    id,
    targetFunctionId,
    description: text(node.description),
    sideEffect: text(node.sideEffect) || "none",
    approvalPolicy: text(node.approval) || "never",
    ...(number(node.timeoutMs) === undefined ? {} : { timeoutMs: number(node.timeoutMs) }),
    ...(target?.input === undefined ? {} : { input: target.input }),
    ...(target?.output === undefined ? {} : { output: target.output }),
    ...(target?.errors === undefined ? {} : { errors: target.errors }),
    runtime: runtimeViews,
    pendingApprovals: approval,
    spans: spanViews,
    timeline: timeline(runtimeViews, spanViews),
  };
}

function makeAgentView(
  node: InspectorObject,
  runtime: readonly InspectorObject[],
  spans: readonly InspectorObject[],
): AgentView {
  const id = text(node.id) || "unknown-agent";
  const generated = record(node.generatedFunction);
  const generatedFunctionId = text(generated?.functionId) || `zsys.agent.${id}.invoke`;
  const runtimeViews = runtime.flatMap((item) => {
    if (text(item.agentId) !== id && text(item.id) !== id) return [];
    const value = runtimeView(item, id);
    return value === undefined ? [] : [value];
  });
  const spanViews = spans.flatMap((item) => {
    const value = spanView(item);
    return value === undefined ? [] : [value];
  });
  return {
    id,
    model: text(node.model),
    ...(node.limits === undefined ? {} : { limits: node.limits }),
    ...(node.input === undefined ? {} : { input: node.input }),
    ...(node.output === undefined ? {} : { output: node.output }),
    toolIds: strings(node.toolIds),
    generatedFunctionId,
    runtime: runtimeViews,
    spans: spanViews,
    timeline: timeline(runtimeViews, spanViews),
  };
}
