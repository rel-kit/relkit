/**
 * Records that a service whose functions declare an access rule depends on the authentication
 * service: the rule is checked against the session that service issues. Without the edge the
 * authentication service appears used by nothing.
 */
import type { GraphEdge, GraphNode } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Adds one `depends-on-service` edge from each service that exposes a function with an access
 * rule to the Better Auth service, when the application has one.
 * @param add - Deduplicating edge accumulator of the graph build.
 * @param nodes - Graph nodes; function nodes carry `access` when they declare a rule.
 * @param edges - Edges built so far; `exposes-function` edges name each function's services.
 * @returns Nothing; edges go to `add`, which keeps one per service pair.
 */
export function addAccessEdges(
  add: (kind: string, from: string, to: string) => void,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): void {
  const auth = nodes.find(
    (node) =>
      node.kind === "service" &&
      isRecord(node.capability) &&
      node.capability.kind === "better-auth",
  );
  if (auth === undefined) return;
  const protectedFunctions = new Set(
    nodes
      .filter((node) => node.kind === "function" && node.access !== undefined)
      .map((node) => node.id),
  );
  const owners = edges
    .filter((edge) => edge.kind === "exposes-function" && protectedFunctions.has(edge.to))
    .map((edge) => edge.from)
    .filter((owner) => owner !== auth.id)
    .sort();
  for (const owner of owners) add("depends-on-service", owner, auth.id);
}
