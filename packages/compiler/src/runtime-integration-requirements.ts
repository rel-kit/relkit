/**
 * Projects validated graph selections into runtime capability requirements.
 * Installing metadata never selects a capability: provider edges and explicit
 * agent nodes determine which SDK-backed registrations enter a generation.
 */
import type {
  RuntimeIntegrationGraph,
  RuntimeProviderNode,
} from "./runtime-integration-plan.types.js";
import type { RuntimeIntegrationRequirement } from "./runtime-integration-telemetry.js";

/**
 * Recognizes a provider projection before accessing adapter identity.
 * @param node - Validated graph node, or a dangling edge target.
 * @returns True when the full provider capability/adapter projection is present.
 */
function isProviderNode(
  node: RuntimeIntegrationGraph["nodes"][number] | undefined,
): node is RuntimeProviderNode {
  return (
    node?.kind === "provider" &&
    typeof node.capability === "string" &&
    node.adapter !== undefined &&
    typeof node.adapter.integrationId === "string" &&
    typeof node.adapter.adapterId === "string" &&
    typeof node.adapter.protocolVersion === "number"
  );
}

/**
 * Selects provider and native agent registrations without loading their modules.
 * @param graph - Canonical graph with deep capability markers preserved.
 * @returns Exact capability requirements; the plan owner deduplicates and sorts.
 */
export function graphIntegrationRequirements(
  graph: RuntimeIntegrationGraph,
): RuntimeIntegrationRequirement[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const required = new Set(
    graph.edges.filter((edge) => edge.kind === "uses-provider-profile").map((edge) => edge.to),
  );
  const entries: RuntimeIntegrationRequirement[] = [...required]
    .map((id) => nodes.get(id))
    .filter(isProviderNode)
    .map((node) => ({
      integrationId: node.adapter.integrationId,
      capability: node.capability,
      adapterId: node.adapter.adapterId,
      protocolVersion: node.adapter.protocolVersion,
    }));
  if (graph.nodes.some((node) => node.kind === "agent"))
    entries.push({
      integrationId: "langchain",
      capability: "agent-execution",
      adapterId: "langchain",
      protocolVersion: 1,
    });
  if (graph.nodes.some((node) => node.kind === "agent" && node.requiresDeepAgents === true))
    entries.push({
      integrationId: "langchain",
      capability: "agent-deep",
      adapterId: "deepagents",
      protocolVersion: 1,
    });
  return entries;
}
