import { FRAMEWORK_RPC_PATH } from "../contracts/client-api.js";

/** Match the reserved RelKit control-plane path and its descendants. The framework RPC
 * endpoint (`/_relkit/v1/rpc`) lives under the reserved prefix but carries application calls
 * (channels, agents, jobs), so it keeps request spans, records and application middleware.
 * @param path - Request path or issue location.
 * @returns Whether the path equals /_relkit or begins with /_relkit/, outside the RPC endpoint.
 * @example isRelkitControlPlanePath("/_relkit/v1/graph"); // true
 */
export function isRelkitControlPlanePath(path: string): boolean {
  if (path === FRAMEWORK_RPC_PATH || path.startsWith(`${FRAMEWORK_RPC_PATH}/`)) return false;
  return path === "/_relkit" || path.startsWith("/_relkit/");
}
