import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { installAgentInspectorEndpoints } from "./agent-inspector.js";
import { installAgentProtocolEndpoints } from "./agent-protocol.js";
import { installApiDocs, type ApiDocsOptions } from "./api-docs.js";
import { installClientContractEndpoint } from "./client-contract.js";
import { installClientIdentityEndpoint } from "./client-identity.js";
import type { CreateAppOptions, FrameworkMiddlewareInput } from "./create-app.types.js";
import { installHttpLogging } from "./http-logging.js";
import { graphSnapshot, installInternalEndpoints } from "./internal-endpoints.js";
import { assertHttpManifest, materializeRoutes } from "./materialize-routes.js";
import { createFrameworkMiddleware, FRAMEWORK_MIDDLEWARE_ORDER } from "./middleware.js";
import { installTransportSecurity } from "./transport-security.js";
export type { CreateAppOptions, FrameworkMiddlewareInput } from "./create-app.types.js";

/** Creates the HTTP application from the already verified registration plan.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The synchronously constructed Hono application; request work remains lazy.
 */
export function createApp(options: CreateAppOptions): Hono {
  assertHttpManifest(options);
  const app = new Hono();
  installHttpLogging(app, options);
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
  installTransportSecurity(app, options.transportSecurity);
  installInternalEndpoints(app, {
    graph: graphSnapshot(options.plan),
    ...(options.internalEndpoints ?? {}),
  });
  installAgentInspectorEndpoints(app, options, options.internalEndpoints ?? {});
  installApiDocs(app, options.plan, apiDocsOptions(options));
  installClientContractEndpoint(app, options.clientContract);
  if (options.clientIdentity !== undefined) {
    installClientIdentityEndpoint(app, options.clientIdentity, options.auth);
  }
  installAgentProtocolEndpoints(app, options);
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

/** Resolves API-document options from the application configuration.
 * @param options - Application dependencies and configuration for this domain.
 * @returns API-doc settings with explicit options overriding internal-endpoint defaults.
 */
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

/** Installs supplied framework middleware in the fixed v3 order.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @returns Nothing; the requested update is applied to the owned state.
 */
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

/** Normalizes optional middleware configuration into an ordered list.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @returns A map of unique, recognized framework middleware names to their handlers.
 */
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
