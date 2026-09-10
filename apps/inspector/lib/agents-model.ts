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
import type {
  AgentView,
  SpanView,
  TimelineEntry,
  ToolApprovalView,
  ToolRuntimeView,
  ToolView,
} from "./agents-model-types";
export type {
  AgentView,
  SpanView,
  TimelineEntry,
  ToolApprovalView,
  ToolRuntimeView,
  ToolView,
} from "./agents-model-types";
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
    .flatMap((node) =>
      node.kind === "agent" && node.execution !== "graph"
        ? [makeAgentView(node, runtime, spans)]
        : [],
    )
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
  const generatedFunctionId = text(generated?.functionId) || `relkit.agent.${id}.invoke`;
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
    client: node.client === "public" || node.client === "protected" ? node.client : "internal",
    controls: strings(node.controls).filter(isAgentControl),
    chat: record(node.chat) !== undefined,
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

function isAgentControl(value: string): value is "steer" | "follow-up" | "stop" | "approve" {
  return value === "steer" || value === "follow-up" || value === "stop" || value === "approve";
}
