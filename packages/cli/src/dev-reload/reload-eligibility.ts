/**
 * Compares the check that produced the serving generation with a new one and says whether
 * the new handlers can be swapped into the running server. Configuration, the provider and
 * local-service plans, the jobs manifest, schema-library identity and the graph's shape
 * (every node and edge with source positions removed, which covers routes, bindings and
 * schemas) must be identical; otherwise the save takes the blue/green path. Pure.
 */
import { canonicalJson } from "relkit/contracts";
import type { CheckResult } from "../commands/check-result.types.js";

/**
 * Names the first difference that rules out an in-place swap.
 * @param previous - Check of the serving generation.
 * @param next - Check of the saved sources.
 * @returns The blocking difference, or undefined when only handler code changed.
 */
export function swapBlocker(previous: CheckResult, next: CheckResult): string | undefined {
  if (!next.ok || !next.activatable) return "the new check is not activatable";
  if (canonicalJson(previous.config ?? null) !== canonicalJson(next.config ?? null))
    return "configuration changed";
  const before = previous.outputs;
  const after = next.outputs;
  if (before.runtimeIntegrations !== after.runtimeIntegrations) return "provider bindings changed";
  if (before.localServices !== after.localServices) return "local services changed";
  if ((before.jobsManifest ?? "") !== (after.jobsManifest ?? "")) return "jobs changed";
  if (schemaLibraries(before.runtimeActivation) !== schemaLibraries(after.runtimeActivation))
    return "schema library versions changed";
  // Equal graph text has an equal shape; only a changed graph is parsed and canonicalized.
  if (before.graph !== after.graph && graphShape(before.graph) !== graphShape(after.graph))
    return "graph shape changed";
  return undefined;
}

/**
 * Projects a graph to its shape: canonical JSON without `source` positions.
 * @param graph - Serialized application graph.
 * @returns Canonical shape text.
 */
export function graphShape(graph: string): string {
  return canonicalJson(JSON.parse(graph, (key, value) => (key === "source" ? undefined : value)));
}

/**
 * Reads the schema-library hash from the activation output, if present.
 * @param activation - Serialized runtime activation output.
 * @returns The hash, empty when absent, or the raw text when unreadable.
 */
function schemaLibraries(activation: string): string {
  if (activation === "") return "";
  try {
    const parsed: { readonly schemaLibrariesHash?: string } = JSON.parse(activation);
    return parsed.schemaLibrariesHash ?? "";
  } catch {
    return activation;
  }
}
