/**
 * Builds only the legacy inspection router behind the shared application policy.
 * Public REST/RPC, MCP, AG-UI and Scalar are already owned by the ready application
 * and are never initialized again merely to register a rich inspection endpoint.
 */
import { createApplicationShell } from "./create-rest-app.js";
import { installAgentInspectorEndpoints } from "./agent-inspector.js";
import type { CreateAppOptions } from "./create-app.types.js";

/** Creates an unused router for generation-owned legacy inspection registration.
 * @param options - Checked generation policy without per-request services.
 * @returns Inspection shell with the original middleware/security ordering.
 */
export function createInspectionApp(options: CreateAppOptions) {
  const app = createApplicationShell(options);
  const internal = options.internalEndpoints ?? {};
  const mode = internal.environment ?? internal.mode ?? "development";
  installAgentInspectorEndpoints(app, options, {
    ...internal,
    enabled: mode !== "production" && internal.enabled !== false,
  });
  return app;
}
