import { API_BASE_PATH } from "@relkit/contracts";
import type { Hono } from "hono";
import { INSPECTOR_API_PATHS } from "./inspector-endpoint-paths.js";
import { identity } from "./shared.js";
import { json, requiredParam } from "./router-utils.js";
import type { Guard, Project } from "./resource-routes.types.js";

/**
 * Registers core readonly Hono edges before collection-specific native jobs routes.
 * @param app - Installing native router.
 * @param guard - Authorization-first native ingress wrapper.
 * @param project - Query projection on the reused router owner.
 * @returns No value; route registration is synchronous.
 */
export function installCoreQueryRoutes(app: Hono, guard: Guard, project: Project): void {
  app.get(
    API_BASE_PATH,
    guard(async () => json({ capabilities: INSPECTOR_API_PATHS }), false),
  );
  app.get(
    `${API_BASE_PATH}/health/live`,
    guard(async () => json({ status: "ok" }), false),
  );
  app.get(
    `${API_BASE_PATH}/health/ready`,
    guard(async (_context, generation) => {
      if (generation === undefined)
        return json({ status: "not-ready", reason: "no-active-generation" }, 503);
      return json({ ...identity(generation), status: "ready" });
    }),
  );
  app.get(
    `${API_BASE_PATH}/graph`,
    guard(async (_context, generation) => json(await project(generation, { kind: "graph" }))),
  );
  app.get(
    `${API_BASE_PATH}/graph/descriptors`,
    guard(async (context, generation) =>
      json(
        await project(generation, {
          kind: "graph-list",
          collection: "descriptors",
          request: context.req.raw,
        }),
      ),
    ),
  );
  app.get(
    `${API_BASE_PATH}/graph/descriptors/:id`,
    guard(async (context, generation) =>
      json(
        await project(generation, {
          kind: "graph-detail",
          collection: "descriptors",
          id: requiredParam(context, "id"),
        }),
      ),
    ),
  );
  app.get(
    `${API_BASE_PATH}/env`,
    guard(async (context, generation) =>
      json(await project(generation, { kind: "environment", request: context.req.raw })),
    ),
  );
  app.get(
    `${API_BASE_PATH}/diagnostics`,
    guard(async (context, generation) =>
      json(await project(generation, { kind: "diagnostics", request: context.req.raw })),
    ),
  );
  app.get(
    `${API_BASE_PATH}/source/:id`,
    guard(async (context, generation) =>
      json(await project(generation, { kind: "source", id: requiredParam(context, "id") })),
    ),
  );
  app.get(
    `${API_BASE_PATH}/graph/source/:id`,
    guard(async (context, generation) =>
      json(await project(generation, { kind: "source", id: requiredParam(context, "id") })),
    ),
  );
}
