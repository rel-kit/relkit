import { workflowNodeId } from "./graph-agent-topology";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./graph-model";

export function withExecutionOverlay(
  graph: GraphSnapshot,
  agentId: string,
  value: unknown,
): GraphSnapshot {
  const overlay = record(value);
  if (overlay === undefined || overlay.agentId !== agentId) return graph;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const runs = records(overlay.runs);
  for (const run of runs) {
    const runId = text(run.runId);
    if (runId === undefined) continue;
    const nodeId = executionId(agentId, "run", runId);
    nodes.push(observedNode(nodeId, "execution-run", runId, agentId, run.status));
    edges.push(observedEdge(agentId, nodeId, "executes"));
  }
  const activeRun = text(runs.at(-1)?.runId);
  for (const execution of records(overlay.executions)) {
    const scope = strings(execution.scope);
    const label = text(execution.agent) ?? text(execution.node) ?? (scope.join(" / ") || "root");
    const nodeId = executionId(agentId, "scope", scope.join("/"));
    const parent = activeRun === undefined ? agentId : executionId(agentId, "run", activeRun);
    nodes.push(observedNode(nodeId, "live-execution", label, agentId, execution.status));
    edges.push(observedEdge(parent, nodeId, "nested-execution"));
  }
  for (const attempt of records(overlay.attempts)) {
    const attemptId = text(attempt.id);
    if (attemptId === undefined) continue;
    const number = typeof attempt.attempt === "number" ? attempt.attempt : 1;
    const label = `${text(attempt.name) ?? text(attempt.node) ?? "task"} · attempt ${number}`;
    const nodeId = executionId(agentId, "attempt", attemptId);
    const scope = strings(attempt.scope);
    const parent = scope.length === 0 ? agentId : executionId(agentId, "scope", scope.join("/"));
    nodes.push(
      observedNode(
        nodeId,
        number > 1 ? "retry-attempt" : "execution-attempt",
        label,
        agentId,
        attempt.status,
      ),
    );
    edges.push(observedEdge(parent, nodeId, number > 1 ? "retry" : "attempt"));
  }
  for (const transition of records(overlay.transitions)) {
    const from = text(transition.from);
    const to = text(transition.to);
    if (from !== undefined && to !== undefined) {
      edges.push(
        observedEdge(
          workflowNodeId(agentId, from),
          workflowNodeId(agentId, to),
          `transition:${text(transition.kind) ?? "lifecycle"}`,
        ),
      );
    }
  }
  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes].sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
    ),
    observedEdges: [...graph.observedEdges, ...edges],
  };
}

function observedNode(
  id: string,
  kind: string,
  label: string,
  parentId: string,
  status: unknown,
): GraphNode {
  return {
    id,
    kind,
    label,
    parentId,
    observed: true,
    ...(typeof status === "string" ? { status } : {}),
  };
}

function observedEdge(from: string, to: string, kind: string): GraphEdge {
  return { relationship: "observed", from, to, kind };
}

function executionId(agentId: string, kind: string, value: string): string {
  return `${agentId}::execution::${kind}:${encodeURIComponent(value)}`;
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
