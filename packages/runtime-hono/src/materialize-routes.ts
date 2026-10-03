import type { HttpTriggerRegistration } from "@relkit/graph";
import type { Hono } from "hono";
import { registerAuthMiddleware } from "./auth.js";
import { installHttpLogging } from "./http-logging.js";
import { createRouteHandler, getEntry, isRecord } from "./materialize-routes-utils.js";
import { assertHttpManifest } from "./materialize-routes-validation.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { installMcp } from "./mcp.js";
import {
  FRAMEWORK_MIDDLEWARE_ORDER,
  type FrameworkMiddleware,
  type FrameworkMiddlewareName,
} from "./middleware.js";
import { withRateLimit } from "./rate-limit.js";
import { registerRouteMiddleware } from "./route-middleware.js";
import { installRpcWebSocket } from "./rpc-websocket.js";
import { installRpc } from "./rpc.js";
import { installStaticFiles } from "./static-files.js";
export { RuntimeHonoManifestError } from "./manifest-validation.js";
export type { RuntimeHonoManifestErrorCode } from "./manifest-validation.js";
export { assertHttpManifest } from "./materialize-routes-validation.js";
export type {
  HttpEngine,
  HttpInputMapper,
  HttpInvocationOptions,
  HttpRouteRequest,
  ManifestEntries,
  RouteMaterializationOptions,
  RuntimeManifest,
} from "./materialize-routes.types.js";
export { FRAMEWORK_MIDDLEWARE_ORDER };
export type { FrameworkMiddleware, FrameworkMiddlewareName };
/** Validates and registers declared routes with deterministic middleware ordering.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; registers validated HTTP, RPC, optional WebSocket, MCP and static routes.
 */
export function materializeRoutes(app: Hono, options: RouteMaterializationOptions): void {
  assertHttpManifest(options);
  installHttpLogging(app, options);
  registerAuthMiddleware(app, options.auth);
  registerRouteMiddleware(app, options);
  const triggers = [...options.plan.httpTriggers].sort(
    (left, right) => Number(right.config.method === "HEAD") - Number(left.config.method === "HEAD"),
  );
  for (const trigger of triggers) {
    if (trigger.config.rawHandler === true) {
      registerRawRoute(app, trigger, options);
      continue;
    }
    const handler = withRateLimit(trigger, options, createRouteHandler(trigger, options));
    for (const path of trigger.config.runtimePaths ?? [trigger.config.path]) {
      if (trigger.config.method === "HEAD") {
        app.on("GET", path, (context, next) =>
          context.req.method === "HEAD" ? handler(context) : next(),
        );
      } else {
        app.on(trigger.config.method, path, handler);
      }
    }
  }
  if (options.upgradeWebSocket !== undefined) {
    installRpcWebSocket(app, options, options.upgradeWebSocket);
  }
  installRpc(app, options);
  installMcp(app, options);
  installStaticFiles(app, options.staticFiles);
}
/** Registers one raw route using the configured method and path.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; registers callable raw handlers for every compiled runtime path.
 */
function registerRawRoute(
  app: Hono,
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): void {
  const route = getEntry(options.manifest.routes ?? {}, trigger.id);
  if (!isRecord(route) || typeof route.handler !== "function") return;
  const handler = route.handler as (request: Request) => Response | Promise<Response>;
  for (const path of trigger.config.runtimePaths ?? [trigger.config.path]) {
    /** Forward the raw Fetch request without invoking declarative input mapping.
     * @param context - Hono context supplying the original native request.
     * @returns A Promise for the raw route handler's response.
     */
    const run = (context: { readonly req: { readonly raw: Request } }) =>
      Promise.resolve(handler(context.req.raw));
    if (trigger.config.method === "ALL") app.all(path, run);
    else app.on(trigger.config.method, path, run);
  }
}
