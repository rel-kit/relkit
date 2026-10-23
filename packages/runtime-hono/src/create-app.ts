/**
 * Constructs the canonical eager HTTP application. Shared REST setup lives in
 * create-rest-app; RPC stays core and optional protocols require an explicitly
 * loaded installer. Prepared construction supplies selected installers at startup.
 */
import type { Hono } from "hono";
import { installAgentInspectorEndpoints } from "./agent-inspector.js";
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
  const internal = options.internalEndpoints ?? {};
  const mode = internal.environment ?? internal.mode ?? "development";
  installAgentInspectorEndpoints(app, options, {
    ...internal,
    enabled: mode !== "production" && internal.enabled !== false,
  });
  installApplicationDocuments(app, options);
  installSelectedProtocols(app, options);
  materializeRoutes(app, routeOptions(options));
  return app;
}

/** Registers explicitly selected optional protocols before declared REST routes.
 * @param app - Validated shell whose common policy is already installed.
 * @param options - Capability selection and borrowed native installers.
 * @returns Nothing; missing selected installers reject synchronous construction.
 */
function installSelectedProtocols(app: Hono, options: CreateAppOptions): void {
  if (options.agUi === true) {
    if (options.optionalTransports?.agUi === undefined)
      throw new TypeError(
        "AG-UI requires createPreparedApp or an explicit @relkit/runtime-hono/ag-ui installer.",
      );
    options.optionalTransports.agUi(app, options);
  }
  if (options.mcp?.enabled === true) {
    if (options.optionalTransports?.mcp === undefined)
      throw new TypeError(
        "MCP requires createPreparedApp or an explicit @relkit/runtime-hono/mcp installer.",
      );
    options.optionalTransports.mcp(app, options);
  }
}
