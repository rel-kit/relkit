import { GRAPH_VERSION } from "@relkit/contracts";
import {
  canonicalizeGraph,
  hashGraph,
  validateGraphShape,
  type ApplicationGraph,
} from "@relkit/graph";
import { validateBoundary } from "./from-graph-boundary.js";
import { buildPlan } from "./from-graph-plan.js";
import {
  DeploymentPlanError,
  onlyApp,
  providerMap,
  validateProviders,
  type DeploymentPlanErrorCode,
  type FromGraphOptions,
} from "./from-graph-validation.js";

export { DeploymentPlanError, type DeploymentPlanErrorCode, type FromGraphOptions };

export function fromGraph(graph: ApplicationGraph, options: FromGraphOptions = {}) {
  validateBoundary(graph);
  validateBoundary(options);
  if (graph.contractVersion !== GRAPH_VERSION)
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_VERSION_UNSUPPORTED",
      `Graph contract version ${String(graph.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Regenerate with \`relkit check\`.`,
    );
  try {
    validateGraphShape(graph);
  } catch (error) {
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      error instanceof Error ? error.message : "Graph shape is invalid.",
    );
  }
  const normalized = canonicalizeGraph(graph);
  const app = onlyApp(normalized.nodes);
  const appId = normalized.appId ?? app.id;
  if (normalized.appId !== undefined && normalized.appId !== app.id)
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      "Graph appId does not match its app node.",
    );
  const providers = providerMap(normalized.nodes);
  validateProviders(providers, normalized.nodes, normalized.edges);
  return buildPlan(normalized, app, appId, hashGraph(normalized), options, providers);
}

export const createDeploymentPlan = fromGraph;
