/**
 * Composes the canonical eager transport registration. REST policy is shared
 * with prepared applications; RPC, WebSocket and MCP follow declared REST
 * routes, with static files retaining their existing final precedence.
 */
import type { Hono } from "hono";
import { materializeRestRoutes } from "./materialize-rest-routes.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { installMcp } from "./mcp.js";
import {
  FRAMEWORK_MIDDLEWARE_ORDER,
  type FrameworkMiddleware,
  type FrameworkMiddlewareName,
} from "./middleware.js";
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
  materializeRestRoutes(app, options);
  if (options.upgradeWebSocket !== undefined) {
    installRpcWebSocket(app, options, options.upgradeWebSocket);
  }
  installRpc(app, options);
  installMcp(app, options);
  installStaticFiles(app, options.staticFiles);
}
