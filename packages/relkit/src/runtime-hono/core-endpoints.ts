/**
 * Keeps liveness, readiness and the development activation witness independent
 * of rich inspection. Existing authorization still protects configured probes;
 * production graph proof requires an explicit authorization authority.
 */
import { API_BASE_PATH, type JsonValue } from "../contracts/index.js";
import type { Context, Hono } from "hono";
import type { InternalEndpointOptions } from "./internal-endpoints.types.js";
import {
  graphIdentity,
  isAuthorized,
  jsonResponse,
  protectedProblem,
  resolveValue,
} from "./internal-endpoints-utils.js";

/** Installs core probes before optional inspection routes are considered.
 * @param app - Shell whose security and common middleware are already installed.
 * @param options - Existing probe authorization, cohort witness and readiness owner.
 * @returns Nothing; core handlers remain present when rich inspection is disabled.
 */
export function installCoreEndpoints(app: Hono, options: InternalEndpointOptions): void {
  const guard = (handler: () => Promise<Response>) => async (context: Context) => {
    if (!(await isAuthorized(context.req.raw, options))) return protectedProblem(context);
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
  app.get(`${API_BASE_PATH}/graph`, async (context) => {
    if (!(await isAuthorized(context.req.raw, options))) return protectedProblem(context);
    // Only the development bridge's inspection session reads structure here (D8).
    const inspection = inspectionGraph(options);
    if (inspection !== undefined && (await inspection.authorize(context.req.raw)))
      return jsonResponse(await inspection.graph());
    return jsonResponse(graphIdentity(await resolveValue(options.graph ?? {})));
  });
}

/** The development inspection session's view of the graph probe, emitted by the generated server. */
interface InspectionGraphSource {
  readonly authorize: (request: Request) => boolean | Promise<boolean>;
  readonly graph: () => Promise<JsonValue>;
}

/** Reads the optional inspection authority beside the probe's configured witness.
 * @param options - Probe options as the generated server passes them.
 * @returns The authority when both callbacks are present; otherwise identity is all there is.
 */
function inspectionGraph(options: InternalEndpointOptions): InspectionGraphSource | undefined {
  const value: unknown = (options as { readonly inspection?: unknown }).inspection;
  if (typeof value !== "object" || value === null) return undefined;
  const { authorize, graph } = value as Partial<InspectionGraphSource>;
  return typeof authorize === "function" && typeof graph === "function"
    ? { authorize, graph }
    : undefined;
}
