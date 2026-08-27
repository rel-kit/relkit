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
  AWS_DEPLOYMENT_CAPABILITIES,
  DeploymentPlanError,
  onlyApp,
  providerMap,
  validateProviders,
  type DeploymentPlanErrorCode,
  type FromGraphOptions,
} from "./from-graph-validation.js";

export {
  AWS_DEPLOYMENT_CAPABILITIES,
  DeploymentPlanError,
  type DeploymentPlanErrorCode,
  type FromGraphOptions,
};

export function fromGraph(graph: ApplicationGraph, options: FromGraphOptions = {}) {
  validateBoundary(graph);
  validateBoundary(options);
  try {
    validateGraphShape(graph);
  } catch (error) {
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      error instanceof Error ? error.message : "Graph shape is invalid.",
    );
  }
  const normalized = canonicalizeGraph(graph);
  if (normalized.contractVersion !== GRAPH_VERSION)
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      "Unsupported graph contract version.",
    );
  const app = onlyApp(normalized.nodes);
  const appId = normalized.appId ?? app.id;
  if (normalized.appId !== undefined && normalized.appId !== app.id)
    throw new DeploymentPlanError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      "Graph appId does not match its app node.",
    );
  const providers = providerMap(normalized.nodes);
  validateProviders(app, providers, normalized.nodes, normalized.edges);
  return buildPlan(normalized, appId, hashGraph(normalized), options, providers);
}

export const createDeploymentPlan = fromGraph;
