/**
 * Keeps liveness, readiness and the development activation witness independent
 * of rich inspection. Existing authorization still protects configured probes;
 * production graph proof requires an explicit authorization authority.
 */
import { API_BASE_PATH } from "@relkit/contracts";
import type { Context, Hono } from "hono";
import type { InternalEndpointOptions } from "./internal-endpoints.types.js";
import { isAuthorized, jsonResponse, resolveValue } from "./internal-endpoints-utils.js";

/** Installs core probes before optional inspection routes are considered.
 * @param app - Shell whose security and common middleware are already installed.
 * @param options - Existing probe authorization, cohort witness and readiness owner.
 * @returns Nothing; core handlers remain present when rich inspection is disabled.
 */
export function installCoreEndpoints(app: Hono, options: InternalEndpointOptions): void {
  const guard = (handler: () => Promise<Response>) => async (context: Context) => {
    if (!(await isAuthorized(context.req.raw, options)))
      return jsonResponse({ error: "internal-endpoint-protected" }, 401, {
        "www-authenticate": "Bearer",
      });
    return handler();
  };
  app.get(
    `${API_BASE_PATH}/health/live`,
    guard(async () => jsonResponse({ status: "ok" })),
  );
  app.get(
    `${API_BASE_PATH}/health/ready`,
    guard(async () => {
      const ready = await resolveValue(options.readiness ?? options.ready ?? { ready: true });
      return jsonResponse(
        ready.ready
          ? { status: "ready" }
          : { status: "not-ready", reason: ready.reason ?? "unavailable" },
        ready.ready ? 200 : 503,
      );
    }),
  );
  const mode = options.environment ?? options.mode ?? "development";
  if (mode === "production" && options.bearerToken === undefined && options.authorize === undefined)
    return;
  app.get(
    `${API_BASE_PATH}/graph`,
    guard(async () => jsonResponse(await resolveValue(options.graph ?? { graph: null }))),
  );
}
