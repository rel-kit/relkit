import { API_BASE_PATH, type MaybePromise } from "@relkit/contracts";
import type { ObservabilityQuery, ObservabilityStream } from "@relkit/observability";
import { graphDetail, graphList, graphSnapshot, sourceDetail, GRAPH_COLLECTIONS } from "./graph.js";
import { environmentMetadata } from "./environment.js";
import { diagnostics } from "./diagnostics.js";
import { runtimeDetail, runtimeList, runtimeSnapshot, RUNTIME_COLLECTIONS } from "./runtime.js";
import { INSPECTOR_ACTION_PATHS, installInspectorActionEndpoints } from "./actions.js";
import { OBSERVABILITY_ENDPOINT_PATHS } from "./observability.js";
import {
  authorized,
  errorResponse,
  installObservability,
  json,
  negotiate,
  required,
  requiredParam,
  withGeneration,
  validateConfiguration,
} from "./router-utils.js";
import {
  identity,
  type ActiveGenerationOptions,
  type InspectorMode,
  type ResolvedActiveGeneration,
} from "./shared.js";
import { resolveActiveGeneration } from "./generation.js";
import type { Context, Hono } from "hono";
import { installResourceExplorerEndpoints } from "./resource-routes.js";
export const INSPECTOR_API_PATHS = Object.freeze([
  API_BASE_PATH,
  `${API_BASE_PATH}/health/live`,
  `${API_BASE_PATH}/health/ready`,
  `${API_BASE_PATH}/graph`,
  `${API_BASE_PATH}/graph/descriptors`,
  `${API_BASE_PATH}/graph/descriptors/:id`,
  `${API_BASE_PATH}/source/:id`,
  `${API_BASE_PATH}/graph/source/:id`,
  `${API_BASE_PATH}/env`,
  `${API_BASE_PATH}/diagnostics`,
  `${API_BASE_PATH}/runtime`,
  ...GRAPH_COLLECTIONS.flatMap((collection) => [
    `${API_BASE_PATH}/${collection}`,
    `${API_BASE_PATH}/${collection}/:id`,
  ]),
  `${API_BASE_PATH}/runtime/state`,
  ...RUNTIME_COLLECTIONS.flatMap((collection) => [
    `${API_BASE_PATH}/runtime/${collection}`,
    `${API_BASE_PATH}/runtime/${collection}/:id`,
  ]),
  `${API_BASE_PATH}/runtime/buckets/:id/objects`,
  `${API_BASE_PATH}/runtime/buckets/:id/objects/preview`,
  `${API_BASE_PATH}/runtime/cache/:id/keys`,
  `${API_BASE_PATH}/runtime/cache/:id/keys/value`,
  ...OBSERVABILITY_ENDPOINT_PATHS,
  ...INSPECTOR_ACTION_PATHS,
] as const);
export const INSPECTOR_ENDPOINT_PATHS = INSPECTOR_API_PATHS;
export interface InspectorApiOptions extends ActiveGenerationOptions {
  readonly mode?: InspectorMode;
  readonly environment?: InspectorMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => MaybePromise<boolean>;
  readonly query?: ObservabilityQuery;
  readonly stream?: ObservabilityStream;
  readonly observability?: {
    readonly query: ObservabilityQuery;
    readonly stream: ObservabilityStream;
  };
  readonly maxPreviewBytes?: number;
}
export { InspectorEndpointConfigurationError } from "./router-utils.js";
export function installInspectorEndpoints(app: Hono, options: InspectorApiOptions = {}): void {
  const mode = options.environment ?? options.mode ?? "development";
  const enabled = options.enabled ?? mode !== "production";
  validateConfiguration(mode, enabled, options);
  if (!enabled) return;
  const guard =
    (
      handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
      includeGeneration = true,
    ) =>
    async (context: Context): Promise<Response> => {
      if (!(await authorized(context.req.raw, options)))
        return json({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, {
          "www-authenticate": "Bearer",
        });
      try {
        negotiate(context.req.raw);
        return await handler(
          context,
          includeGeneration ? await resolveActiveGeneration(options) : undefined,
        );
      } catch (error) {
        return errorResponse(error);
      }
    };
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
    guard(async (_context, generation) => json(await withGeneration(generation, graphSnapshot))),
  );
  app.get(
    `${API_BASE_PATH}/graph/descriptors`,
    guard(async (context, generation) =>
      json(await graphList(await required(generation), "descriptors", context.req.raw)),
    ),
  );
  app.get(
    `${API_BASE_PATH}/graph/descriptors/:id`,
    guard(async (context, generation) =>
      json(graphDetail(await required(generation), "descriptors", requiredParam(context, "id"))),
    ),
  );
  app.get(
    `${API_BASE_PATH}/env`,
    guard(async (context, generation) =>
      json(environmentMetadata(await required(generation), context.req.raw)),
    ),
  );
  app.get(
    `${API_BASE_PATH}/diagnostics`,
    guard(async (context, generation) =>
      json(await diagnostics(await required(generation), context.req.raw)),
    ),
  );
  app.get(
    `${API_BASE_PATH}/source/:id`,
    guard(async (context, generation) =>
      json(sourceDetail(await required(generation), requiredParam(context, "id"))),
    ),
  );
  app.get(
    `${API_BASE_PATH}/graph/source/:id`,
    guard(async (context, generation) =>
      json(sourceDetail(await required(generation), requiredParam(context, "id"))),
    ),
  );
  for (const collection of GRAPH_COLLECTIONS) {
    app.get(
      `${API_BASE_PATH}/${collection}`,
      guard(async (context, generation) =>
        json(await graphList(await required(generation), collection, context.req.raw)),
      ),
    );
    app.get(
      `${API_BASE_PATH}/${collection}/:id`,
      guard(async (context, generation) =>
        json(graphDetail(await required(generation), collection, requiredParam(context, "id"))),
      ),
    );
  }
  app.get(
    `${API_BASE_PATH}/runtime`,
    guard(async (_context, generation) => json(await withGeneration(generation, runtimeSnapshot))),
  );
  app.get(
    `${API_BASE_PATH}/runtime/state`,
    guard(async (_context, generation) => json(await withGeneration(generation, runtimeSnapshot))),
  );
  for (const collection of RUNTIME_COLLECTIONS) {
    app.get(
      `${API_BASE_PATH}/runtime/${collection}`,
      guard(async (context, generation) =>
        json(await runtimeList(await required(generation), collection, context.req.raw)),
      ),
    );
    app.get(
      `${API_BASE_PATH}/runtime/${collection}/:id`,
      guard(async (context, generation) =>
        json(
          await runtimeDetail(await required(generation), collection, requiredParam(context, "id")),
        ),
      ),
    );
  }
  installResourceExplorerEndpoints(app, guard, options.maxPreviewBytes ?? 1_048_576);
  installObservability(app, options, mode);
  installInspectorActionEndpoints(app, {
    mode,
    enabled,
    authorize: (request) => authorized(request, options),
    getGeneration: () => resolveActiveGeneration(options),
  });
}
