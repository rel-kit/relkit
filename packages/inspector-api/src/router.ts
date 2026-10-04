import { API_BASE_PATH } from "@relkit/contracts";
import { Effect, Layer, ManagedRuntime } from "effect";
import { projectionAttempt, runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { GRAPH_COLLECTIONS } from "./graph.js";
import { RUNTIME_COLLECTIONS } from "./runtime.js";
import { installInspectorActionEndpoints } from "./actions.js";
import {
  authorized,
  errorResponse,
  installObservability,
  json,
  required,
  requiredParam,
  validateConfiguration,
} from "./router-utils.js";
import { type ResolvedActiveGeneration } from "./shared.js";
import { resolveActiveGeneration, resolveActiveGenerationEffect } from "./generation.js";
import type { Context, Hono } from "hono";
import { installResourceExplorerEndpoints } from "./resource-routes.js";
import { installJobsEndpoints } from "./jobs/routes.js";
import { InspectorQueries, inspectorQueriesLayer } from "./query.service.js";
import {
  inspectorLoggerLayer,
  registerInspectorOwner,
  disposeInspectorOwners,
} from "./execution.js";
import { inspectorControlsLayer } from "./controls.service.js";
import { inspectorNativeJobsLayer } from "./jobs/native.service.js";
import { inspectorObservabilityLayer } from "./observability.service.js";
import type { InspectorProjection } from "./query.types.js";
import type { InspectorApiOptions } from "./router.types.js";
export type { InspectorApiOptions } from "./router.types.js";
export { INSPECTOR_API_PATHS, INSPECTOR_ENDPOINT_PATHS } from "./inspector-endpoint-paths.js";
export { InspectorEndpointConfigurationError } from "./router-utils.js";

/**
 * Installs synchronous Hono edges backed by one query owner per installation.
 * @param app - Router whose lifetime owns the installed service layer.
 * @param options - Generation, authorization and optional observability authorities.
 * @returns No value; registration is immediate and service acquisition is lazy.
 * @remarks Call disposeInspectorEndpoints when the router is retired. SSE responses
 * separately own their live feeds and can close without retiring the router.
 */
export function installInspectorEndpoints(app: Hono, options: InspectorApiOptions = {}): void {
  const mode = options.environment ?? options.mode ?? "development";
  const enabled = options.enabled ?? mode !== "production";
  validateConfiguration(mode, enabled, options);
  if (!enabled) return;
  const observation =
    options.observability ??
    (options.query && options.stream
      ? { query: options.query, stream: options.stream }
      : undefined);
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      inspectorQueriesLayer({
        ...options,
        authorize: (request) => authorized(request, options),
      }).pipe(Layer.provide(inspectorNativeJobsLayer)),
      inspectorControlsLayer,
      inspectorNativeJobsLayer,
      inspectorObservabilityLayer(observation?.query, observation?.stream),
      inspectorLoggerLayer(options.logging),
    ),
  );
  registerInspectorOwner(app, runtime);
  const project = (
    generation: ResolvedActiveGeneration | undefined,
    projection: InspectorProjection,
  ) =>
    runExecutionPromise(
      runtime,
      Effect.flatMap(InspectorQueries, (queries) =>
        Effect.flatMap(
          projectionAttempt(() => required(generation)),
          (active) => queries.project(active, projection),
        ),
      ),
    );
  const guard =
    (
      handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
      includeGeneration = true,
    ) =>
    async (context: Context): Promise<Response> => {
      try {
        const access = await runExecutionPromise(
          runtime,
          Effect.flatMap(InspectorQueries, (queries) =>
            queries.access(context.req.raw, includeGeneration),
          ),
        );
        if (!access.allowed)
          return json({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, {
            "www-authenticate": "Bearer",
          });
        return await handler(context, access.generation);
      } catch (error) {
        return errorResponse(error);
      }
    };
  installCoreQueryRoutes(app, guard, project);
  installJobsEndpoints(app, guard, runtime);
  for (const collection of GRAPH_COLLECTIONS) {
    app.get(
      `${API_BASE_PATH}/${collection}`,
      guard(async (context, generation) =>
        json(
          await project(generation, { kind: "graph-list", collection, request: context.req.raw }),
        ),
      ),
    );
    app.get(
      `${API_BASE_PATH}/${collection}/:id`,
      guard(async (context, generation) =>
        json(
          await project(generation, {
            kind: "graph-detail",
            collection,
            id: requiredParam(context, "id"),
          }),
        ),
      ),
    );
  }
  app.get(
    `${API_BASE_PATH}/runtime`,
    guard(async (_context, generation) => json(await project(generation, { kind: "runtime" }))),
  );
  app.get(
    `${API_BASE_PATH}/runtime/state`,
    guard(async (_context, generation) => json(await project(generation, { kind: "runtime" }))),
  );
  for (const collection of RUNTIME_COLLECTIONS) {
    app.get(
      `${API_BASE_PATH}/runtime/${collection}`,
      guard(async (context, generation) =>
        json(
          await project(generation, { kind: "runtime-list", collection, request: context.req.raw }),
        ),
      ),
    );
    app.get(
      `${API_BASE_PATH}/runtime/${collection}/:id`,
      guard(async (context, generation) =>
        json(
          await project(generation, {
            kind: "runtime-detail",
            collection,
            id: requiredParam(context, "id"),
          }),
        ),
      ),
    );
  }
  installResourceExplorerEndpoints(app, guard, options.maxPreviewBytes ?? 1_048_576, project);
  installObservability(app, options, mode, runtime);
  installInspectorActionEndpoints(
    app,
    {
      mode,
      enabled,
      authorize: (request) => authorized(request, options),
      getGeneration: () => resolveActiveGeneration(options),
      generationEffect: resolveActiveGenerationEffect(options),
    },
    runtime,
  );
}

/**
 * Releases every Inspector query owner installed on a retired router.
 * @param app - Router previously passed to installInspectorEndpoints.
 * @returns Completion after all owned resources are finalized; repeated disposal is safe.
 */
export async function disposeInspectorEndpoints(app: Hono): Promise<void> {
  await disposeInspectorOwners(app);
}
import { installCoreQueryRoutes } from "./query-routes.js";
