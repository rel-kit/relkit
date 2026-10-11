/**
 * Registers checked REST declarations without importing RPC/MCP transports.
 * Auth, route middleware, HEAD precedence and rate limits are shared by eager
 * and prepared applications. Raw handlers retain their native Fetch boundary;
 * their result is checked before returning it to Hono.
 */
import type { HttpTriggerRegistration } from "@relkit/graph";
import type { Hono } from "hono";
import { registerAuthMiddleware } from "./auth.js";
import { installHttpLogging } from "./http-logging.js";
import { createRouteHandler, getEntry, isRecord } from "./materialize-routes-utils.js";
import { assertHttpManifest } from "./materialize-routes-validation.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { withRateLimit } from "./rate-limit.js";
import { registerRouteMiddleware } from "./route-middleware.js";

/** Registers declared routes after validating the entire manifest.
 * @param app - Shell with framework policy already installed.
 * @param options - Validated cohort and invocation dependencies.
 * @returns Nothing; registration has no asynchronous resource lifetime.
 */
export function materializeRestRoutes(app: Hono, options: RouteMaterializationOptions): void {
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
}

/** Installs a callable raw declaration without trusting its output shape.
 * @param app - Shell receiving native Fetch routes.
 * @param trigger - Checked raw route declaration.
 * @param options - Complete manifest from the same cohort.
 * @returns Nothing; an invalid native response rejects at request execution.
 */
function registerRawRoute(
  app: Hono,
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): void {
  const route = getEntry(options.manifest.routes ?? {}, trigger.id);
  if (!isRecord(route) || typeof route.handler !== "function") return;
  const handler = route.handler;
  /** Calls the guarded native function and validates its Fetch result.
   * @param context - Request supplied by Hono.
   * @returns The native response; incompatible output throws at this boundary.
   */
  const run = async (context: { readonly req: { readonly raw: Request } }): Promise<Response> => {
    const response = await handler(context.req.raw);
    if (!(response instanceof Response))
      throw new TypeError("Raw HTTP handler must return a Response.");
    return response;
  };
  for (const path of trigger.config.runtimePaths ?? [trigger.config.path]) {
    if (trigger.config.method === "ALL") app.all(path, run);
    else app.on(trigger.config.method, path, run);
  }
}
