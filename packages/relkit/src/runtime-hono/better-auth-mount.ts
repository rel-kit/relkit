/**
 * Mounts a Better Auth service's handler at its base path when no route mounts it, so an
 * application needs no `[[...auth]]` route file. Its endpoints never require a session.
 */
import type { Hono } from "hono";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";

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
    const run = async (request: Request): Promise<Response> => {
      const response: unknown = await handler(request);
      if (!(response instanceof Response))
        throw new TypeError("The Better Auth handler must return a Response.");
      return response;
    };
    const base = capability.basePath.replace(/\/$/, "");
    app.all(base === "" ? "/" : base, (context) => run(context.req.raw));
    app.all(`${base}/*`, (context) => run(context.req.raw));
  }
}
