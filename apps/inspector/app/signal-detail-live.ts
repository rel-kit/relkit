import type { InspectorGraph, InspectorObject } from "../lib/api-types";
import { record, records, text } from "../lib/observability-model";

export function isSignalDetailEvent(type: string): boolean {
  return [
    "request.started",
    "request.completed",
    "span.started",
    "span.updated",
    "span.completed",
    "log.emitted",
  ].includes(type);
}

export function attachLogs(
  spans: readonly InspectorObject[],
  logs: readonly InspectorObject[],
): readonly InspectorObject[] {
  const bySpan = new Map<string, InspectorObject[]>();
  for (const log of logs) {
    const id = text(log.spanId);
    const group = bySpan.get(id);
    if (group) group.push(log);
    else bySpan.set(id, [log]);
  }
  return spans.map((span) => ({ ...span, logs: bySpan.get(text(span.spanId)) ?? [] }));
}

export function attachSources(
  spans: readonly InspectorObject[],
  graph: InspectorGraph,
  identity: InspectorObject | undefined,
): readonly InspectorObject[] {
  if (
    text(identity?.generationId) === "" ||
    text(identity?.generationId) !== text(graph.generationId) ||
    text(identity?.graphHash) !== text(graph.graphHash)
  )
    return spans;
  const nested = record(graph.graph);
  const nodes = records(graph.nodes ?? nested?.nodes);
  const sources = new Map(
    nodes.flatMap((node) => {
      const id = text(node.id);
      return id === "" || record(node.source) === undefined ? [] : [[id, node.source] as const];
    }),
  );
  return spans.map((span) => {
    const id =
      text(span.functionId) ||
      text(span.routeId) ||
      text(span.middlewareId) ||
      text(span.toolId) ||
      text(span.agentId) ||
      text(span.serviceId);
    const source = sources.get(id);
    return source === undefined ? span : { ...span, descriptorSource: source };
  });
}
