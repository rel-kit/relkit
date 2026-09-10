import { API_BASE_PATH, API_VERSION } from "@relkit/contracts";

export const INTERNAL_ENDPOINT_PROTOCOL = "relkit.inspector" as const;
export const INTERNAL_ENDPOINT_VERSION = API_VERSION;
export const INTERNAL_ENDPOINT_PATHS = Object.freeze([
  `${API_BASE_PATH}/health/live`,
  `${API_BASE_PATH}/health/ready`,
  `${API_BASE_PATH}/graph`,
  `${API_BASE_PATH}/requests`,
  `${API_BASE_PATH}/logs`,
  `${API_BASE_PATH}/traces`,
  `${API_BASE_PATH}/stream`,
  `${API_BASE_PATH}/diagnostics`,
  `${API_BASE_PATH}/agents/:agentId/workflow`,
  `${API_BASE_PATH}/runtime/agents/:agentId/executions`,
] as const);
