import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import {
  assertHttpManifest,
  materializeRoutes,
  type RouteMaterializationOptions,
} from "./materialize-routes.js";
import {
  createFrameworkMiddleware,
  FRAMEWORK_MIDDLEWARE_ORDER,
  type FrameworkMiddleware,
  type HttpMiddlewareOptions,
} from "./middleware.js";
import {
  graphSnapshot,
  installInternalEndpoints,
  type InternalEndpointOptions,
} from "./internal-endpoints.js";
import { installApiDocs, type ApiDocsOptions } from "./api-docs.js";

export type FrameworkMiddlewareInput =
  | Partial<Record<(typeof FRAMEWORK_MIDDLEWARE_ORDER)[number], MiddlewareHandler>>
  | readonly FrameworkMiddleware[];

export interface CreateAppOptions extends RouteMaterializationOptions {
  readonly frameworkMiddleware?: FrameworkMiddlewareInput;
  readonly middleware?: HttpMiddlewareOptions;
  readonly internalEndpoints?: InternalEndpointOptions;
  readonly apiDocs?: ApiDocsOptions;
}

/** Creates the HTTP application from the already verified registration plan. */
export function createApp(options: CreateAppOptions): Hono {
  assertHttpManifest(options);
  const app = new Hono();
  const middlewareOptions = {
    ...(options.middleware ?? {}),
    graphHash: options.plan.graphHash,
    ...(options.generationId === undefined ? {} : { generationId: options.generationId }),
    ...(options.observability === undefined ? {} : { observability: options.observability }),
  };
  installFrameworkMiddleware(
    app,
    options.frameworkMiddleware ?? createFrameworkMiddleware(middlewareOptions),
  );
  installInternalEndpoints(app, {
    graph: graphSnapshot(options.plan),
    ...(options.internalEndpoints ?? {}),
  });
  installApiDocs(app, options.plan, apiDocsOptions(options));
  const requestMapping =
    options.middleware?.maxBodyBytes === undefined
      ? options.requestMapping
      : { maxBodyBytes: options.middleware.maxBodyBytes, ...(options.requestMapping ?? {}) };
  materializeRoutes(app, {
    ...options,
    ...(requestMapping === undefined ? {} : { requestMapping }),
  });
  return app;
}

function apiDocsOptions(options: CreateAppOptions): ApiDocsOptions {
  const docs = options.apiDocs ?? {};
  const internal = options.internalEndpoints ?? {};
  return {
    ...docs,
    mode: docs.mode ?? internal.environment ?? internal.mode ?? "development",
    ...(docs.bearerToken !== undefined
      ? { bearerToken: docs.bearerToken }
      : internal.bearerToken === undefined
        ? {}
        : { bearerToken: internal.bearerToken }),
    ...(docs.authorize !== undefined
      ? { authorize: docs.authorize }
      : internal.authorize === undefined
        ? {}
        : { authorize: internal.authorize }),
  };
}

/** Installs supplied framework middleware in the fixed v3 order. */
export function installFrameworkMiddleware(
  app: Hono,
  input: FrameworkMiddlewareInput | undefined,
): void {
  if (input === undefined) return;
  const middleware = normalizeFrameworkMiddleware(input);
  for (const name of FRAMEWORK_MIDDLEWARE_ORDER) {
    const handler = middleware.get(name);
    if (handler !== undefined) app.use("*", handler);
  }
}

function normalizeFrameworkMiddleware(
  input: FrameworkMiddlewareInput,
): ReadonlyMap<(typeof FRAMEWORK_MIDDLEWARE_ORDER)[number], MiddlewareHandler> {
  const result = new Map<(typeof FRAMEWORK_MIDDLEWARE_ORDER)[number], MiddlewareHandler>();
  const entries = Array.isArray(input)
    ? input.map((item) => [item.name, item.handler] as const)
    : (Object.entries(input) as readonly [
        (typeof FRAMEWORK_MIDDLEWARE_ORDER)[number],
        MiddlewareHandler,
      ][]);
  for (const [name, handler] of entries) {
    if (!(FRAMEWORK_MIDDLEWARE_ORDER as readonly string[]).includes(name))
      throw new TypeError(`Unknown framework middleware "${String(name)}".`);
    if (result.has(name)) throw new TypeError(`Duplicate framework middleware "${name}".`);
    result.set(name, handler);
  }
  return result;
}
