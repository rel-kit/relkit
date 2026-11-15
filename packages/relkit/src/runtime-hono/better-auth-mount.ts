/**
 * Mounts a Better Auth service's handler at its base path when no route mounts it, so an
 * application needs no `[[...auth]]` route file. Its endpoints never require a session.
 * Requests it handles are recorded under the system route `relkit.auth` instead of `unknown`.
 */
import type { Context, Hono } from "hono";
import { frameworkTrace } from "../invocation/index.js";
import { authSystemRoute, type SystemRoute } from "../observability/index.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import { getRequestState } from "./middleware-utils.js";

/**
 * Registers each Better Auth service that asks RelKit to mount it.
 * @param app - Application receiving the auth endpoints.
 * @param options - Plan and manifest holding the service and its handler.
 * @returns Nothing; a service whose handler is missing from the manifest is skipped.
 */
export function mountBetterAuth(app: Hono, options: RouteMaterializationOptions): void {
  for (const service of options.plan.services ?? []) {
    const capability = service.capability;
    if (capability?.kind !== "better-auth" || capability.mount !== true) continue;
    const entry = getEntry(options.manifest.services ?? {}, service.id);
    const handler = isRecord(entry) ? entry.handler : undefined;
    if (typeof handler !== "function") continue;
    const route = authSystemRoute(capability.basePath);
    const run = async (context: Context): Promise<Response> => {
      announceSystemRoute(context, route);
      const response: unknown = await handler(context.req.raw);
      if (!(response instanceof Response))
        throw new TypeError("The Better Auth handler must return a Response.");
      return response;
    };
    const base = capability.basePath.replace(/\/$/, "");
    app.all(base === "" ? "/" : base, run);
    app.all(`${base}/*`, run);
  }
}

/**
 * Names the authentication system route on the request record and server span.
 * @param context - Hono context of a request the mounted handler answers.
 * @param route - Authentication system route of this mount.
 * @returns Nothing; the function stays `unknown` because no application function runs.
 */
function announceSystemRoute(context: Context, route: SystemRoute): void {
  getRequestState(context)?.requestRecord?.setRoute(route.id, "");
  const pattern = `${route.path.replace(/\/$/, "")}/*`;
  frameworkTrace.rename(`${context.req.method} ${pattern}`);
  frameworkTrace.setAttributes({ "http.route": pattern, "relkit.route.id": route.id });
}
