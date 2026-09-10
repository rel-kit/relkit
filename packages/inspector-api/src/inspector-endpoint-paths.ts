import { API_BASE_PATH } from "@relkit/contracts";
import { INSPECTOR_ACTION_PATHS } from "./actions.js";
import { GRAPH_COLLECTIONS } from "./graph.js";
import { OBSERVABILITY_ENDPOINT_PATHS } from "./observability.js";
import { RUNTIME_COLLECTIONS } from "./runtime.js";

export const INSPECTOR_API_PATHS = Object.freeze([
  API_BASE_PATH,
  `${API_BASE_PATH}/health/live`,
  `${API_BASE_PATH}/health/ready`,
  `${API_BASE_PATH}/graph`,
  `${API_BASE_PATH}/graph/descriptors`,
  `${API_BASE_PATH}/graph/descriptors/:id`,
  `${API_BASE_PATH}/source/:id`,
  `${API_BASE_PATH}/graph/source/:id`,
  `${API_BASE_PATH}/env`,
  `${API_BASE_PATH}/diagnostics`,
  `${API_BASE_PATH}/runtime`,
  ...GRAPH_COLLECTIONS.flatMap((collection) => [
    `${API_BASE_PATH}/${collection}`,
    `${API_BASE_PATH}/${collection}/:id`,
  ]),
  `${API_BASE_PATH}/runtime/state`,
  `${API_BASE_PATH}/agents/:agentId/workflow`,
  `${API_BASE_PATH}/runtime/agents/:agentId/executions`,
  ...RUNTIME_COLLECTIONS.flatMap((collection) => [
    `${API_BASE_PATH}/runtime/${collection}`,
    `${API_BASE_PATH}/runtime/${collection}/:id`,
  ]),
  `${API_BASE_PATH}/runtime/buckets/:id/objects`,
  `${API_BASE_PATH}/runtime/buckets/:id/objects/preview`,
  `${API_BASE_PATH}/runtime/cache/:id/keys`,
  `${API_BASE_PATH}/runtime/cache/:id/keys/value`,
  ...OBSERVABILITY_ENDPOINT_PATHS,
  ...INSPECTOR_ACTION_PATHS,
] as const);

export const INSPECTOR_ENDPOINT_PATHS = INSPECTOR_API_PATHS;
