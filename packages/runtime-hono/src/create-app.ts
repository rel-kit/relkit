/**
 * Constructs the canonical eager HTTP application. Shared REST setup lives in
 * create-rest-app; this public factory adds the agent and RPC/MCP transports in
 * their existing order and preserves synchronous configuration rejection.
 */
import type { Hono } from "hono";
import { installAgentInspectorEndpoints } from "./agent-inspector.js";
import { installAgentProtocolEndpoints } from "./agent-protocol.js";
import type { CreateAppOptions } from "./create-app.types.js";
import {
  createApplicationShell,
  installApplicationDocuments,
  routeOptions,
} from "./create-rest-app.js";
import { materializeRoutes } from "./materialize-routes.js";
export type { CreateAppOptions, FrameworkMiddlewareInput } from "./create-app.types.js";
export { installFrameworkMiddleware } from "./create-rest-app.js";

/** Creates the HTTP application from the already verified registration plan.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The synchronously constructed Hono application; request work remains lazy.
 */
export function createApp(options: CreateAppOptions): Hono {
  const app = createApplicationShell(options);
  installAgentInspectorEndpoints(app, options, options.internalEndpoints ?? {});
  installApplicationDocuments(app, options);
  installAgentProtocolEndpoints(app, options);
  materializeRoutes(app, routeOptions(options));
  return app;
}
