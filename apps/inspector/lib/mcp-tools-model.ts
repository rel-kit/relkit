import type { InspectorGraph, InspectorObject } from "./api-types";

/** One tool the application exposes on its `/mcp` endpoint. */
export interface McpToolView {
  readonly id: string;
  readonly description: string;
  readonly targetFunctionId: string;
  readonly sideEffect: string;
  readonly approval: string;
  readonly input?: unknown;
  readonly output?: unknown;
}

/**
 * Lists the graph's MCP-exposed tools with their target function's schemas.
 * @param graph - Graph response from the Inspector API.
 * @returns Tools with `mcp: true`, sorted by ID.
 */
export function mcpToolViews(graph: InspectorGraph): readonly McpToolView[] {
  const nodes = graphNodes(graph);
  const functions = new Map(
    nodes.filter((node) => node.kind === "function").map((node) => [text(node.id), node]),
  );
  return nodes
    .filter((node) => node.kind === "tool" && node.mcp === true)
    .map((node) => {
      const target = text(node.targetFunctionId);
      const fn = functions.get(target);
      return {
        id: text(node.id),
        description: text(node.description),
        targetFunctionId: target,
        sideEffect: text(node.sideEffect) || "unknown",
        approval: text(node.approval) || "never",
        ...(fn?.input === undefined ? {} : { input: fn.input }),
        ...(fn?.output === undefined ? {} : { output: fn.output }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Whether calling the tool from the Inspector needs no approval step. */
export function callableWithoutApproval(tool: McpToolView): boolean {
  return (
    tool.approval === "never" ||
    (tool.approval === "on-write" && (tool.sideEffect === "none" || tool.sideEffect === "read"))
  );
}

function graphNodes(graph: InspectorGraph): readonly InspectorObject[] {
  const nested = graph.graph?.nodes;
  const nodes = graph.nodes ?? (Array.isArray(nested) ? nested : []);
  return nodes.filter((node): node is InspectorObject => node !== null && typeof node === "object");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
