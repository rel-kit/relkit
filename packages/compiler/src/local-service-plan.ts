import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { LocalServiceGraph, LocalProviderNode } from "./local-service-plan.types.js";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  type LocalServicePlan,
  type LocalServicePlanEntry,
} from "@relkit/local-service";

/**
 * Projects selected local provider services and their dependants.
 * @param graph - Canonical normalized graph.
 * @param graphHash - Hash identifying the accepted graph.
 * @returns A lazy effect that projects selected local provider services and their dependants; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const generateLocalServicePlanEffect = Effect.fn("Compiler.generateLocalServicePlan")(
  function* (graph: LocalServiceGraph, graphHash: string) {
    const requirements = requiredBy(graph);
    const services = graph.nodes
      .filter(isLocalProvider)
      .map((node) => service(node, requirements.get(node.id) ?? []))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
    return Object.freeze({
      version: LOCAL_SERVICE_PLAN_VERSION,
      graphHash,
      services: Object.freeze(services.map((entry) => Object.freeze(entry))),
    });
  },
  (effect, graph, graphHash) =>
    observeCompiler("generation", "generateLocalServicePlan", effect, () => ({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    })),
);

/**
 * Projects selected local provider services and their dependants.
 * @param graph - Canonical normalized graph.
 * @param graphHash - Hash identifying the accepted graph.
 * @returns Selected local services with provider profiles and dependants.
 */
export function generateLocalServicePlan(
  graph: LocalServiceGraph,
  graphHash: string,
): LocalServicePlan {
  return runCompilerSync(generateLocalServicePlanEffect(graph, graphHash));
}

/**
 * Projects one local provider node into its service plan entry.
 * @param node - Parsed source node or normalized graph node.
 * @param requiredBy - Graph identities depending on this provider.
 * @returns The local service entry for the provider node.
 */
function service(node: LocalProviderNode, requiredBy: readonly string[]): LocalServicePlanEntry {
  return {
    bindingId: node.id,
    capability: node.capability,
    profile: node.profile,
    materializerId: "docker",
    recipe: Object.freeze({ ...node.local }),
    configuration: Object.freeze({}),
    requiredBy: Object.freeze([...requiredBy]),
  };
}

/**
 * Collects graph dependants for each selected provider profile.
 * @param graph - Canonical normalized graph.
 * @returns Provider identities mapped to sorted dependant descriptor IDs.
 */
function requiredBy(graph: LocalServiceGraph): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "uses-provider-profile") continue;
    const values = result.get(edge.to) ?? new Set<string>();
    values.add(edge.from);
    result.set(edge.to, values);
  }
  return new Map(
    [...result].map(([bindingId, values]) => [bindingId, Object.freeze([...values].sort())]),
  );
}

/**
 * Recognizes a provider configured with a local service capability.
 * @param node - Parsed source node or normalized graph node.
 * @returns True when the provider node declares a local service projection.
 */
function isLocalProvider(node: LocalServiceGraph["nodes"][number]): node is LocalProviderNode {
  if (node.kind !== "provider") return false;
  const value = node as unknown as Record<string, unknown>;
  const local = value.local as Record<string, unknown> | undefined;
  return (
    typeof value.capability === "string" &&
    typeof value.profile === "string" &&
    local !== undefined &&
    typeof local.integrationId === "string" &&
    typeof local.recipeId === "string" &&
    typeof local.recipeVersion === "number"
  );
}
