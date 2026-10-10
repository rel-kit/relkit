/**
 * Shares eager HTTP policy between canonical and prepared applications. The shell
 * validates the complete manifest and installs framework/security/control routes;
 * REST construction adds documentation, client identity and declared routes without
 * importing agent, RPC or MCP transport implementations. No resources are acquired.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { installApiDocs, type ApiDocsOptions } from "./api-docs.js";
import { installClientContractEndpoint } from "./client-contract.js";
import { installClientIdentityEndpoint } from "./client-identity.js";
import type { CreateAppOptions, FrameworkMiddlewareInput } from "./create-app.types.js";
import { installHttpLogging } from "./http-logging.js";
import { graphSnapshot, installInternalEndpoints } from "./internal-endpoints.js";
import { assertHttpManifest } from "./materialize-routes-validation.js";
import { materializeRestRoutes } from "./materialize-rest-routes.js";
import { createFrameworkMiddleware, FRAMEWORK_MIDDLEWARE_ORDER } from "./middleware.js";
import { installStaticFiles } from "./static-files.js";
import { installTransportSecurity } from "./transport-security.js";

/** Constructs only eagerly required HTTP behavior.
 * @param options - Complete checked cohort and runtime dependencies.
 * @returns A REST application with canonical policy and no deferred transports.
 */
export function createRestApp(options: CreateAppOptions): Hono {
  const app = createApplicationShell(options);
  installApplicationDocuments(app, options);
  materializeRestRoutes(app, routeOptions(options));
  installStaticFiles(app, options.staticFiles);
  return app;
}

/** Validates the cohort and installs policy in canonical order.
 * @param options - Complete checked cohort and runtime dependencies.
 * @returns A shell awaiting transport registration; malformed configuration throws.
 */
export function createApplicationShell(options: CreateAppOptions): Hono {
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
  return app;
}

/** Adds the canonical documentation and client endpoints.
 * @param app - Shell whose policy is already installed.
 * @param options - Validated runtime configuration.
 * @returns Nothing; registers protected documents and client identity.
 */
export function installApplicationDocuments(app: Hono, options: CreateAppOptions): void {
  installApiDocs(app, options.plan, apiDocsOptions(options));
  installClientContractEndpoint(app, options.clientContract);
  if (options.clientIdentity !== undefined) {
    installClientIdentityEndpoint(app, options.clientIdentity, options.auth);
  }
}

/** Merges the framework body limit into route mapping.
 * @param options - Complete application configuration.
 * @returns Route options preserving an explicit mapping override.
 */
export function routeOptions(options: CreateAppOptions): CreateAppOptions {
  if (options.middleware?.maxBodyBytes === undefined) return options;
  return {
    ...options,
    requestMapping: {
      maxBodyBytes: options.middleware.maxBodyBytes,
      ...(options.requestMapping ?? {}),
    },
  };
}

/** Resolves document protection from existing internal endpoint policy.
 * @param options - Complete application configuration.
 * @returns Document settings with explicit overrides taking precedence.
 */
function apiDocsOptions(options: CreateAppOptions): ApiDocsOptions {
  const docs = options.apiDocs ?? {};
  const internal = options.internalEndpoints ?? {};
  const bearerToken = docs.bearerToken ?? internal.bearerToken;
  const authorize = docs.authorize ?? internal.authorize;
  return {
    ...docs,
    mode: docs.mode ?? internal.environment ?? internal.mode ?? "development",
    ...(bearerToken === undefined ? {} : { bearerToken }),
    ...(authorize === undefined ? {} : { authorize }),
  };
}

/** Installs validated middleware in the fixed framework order.
 * @param app - Shell receiving middleware before endpoint registration.
 * @param input - User supplied overrides; missing input installs nothing.
 * @returns Nothing; duplicate or unrecognized names throw before activation.
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

/** Validates names and preserves a single handler for each framework step.
 * @param input - Array or keyed middleware declarations.
 * @returns A validated lookup consumed in framework order.
 */
function normalizeFrameworkMiddleware(
  input: FrameworkMiddlewareInput,
): ReadonlyMap<string, MiddlewareHandler> {
  const result = new Map<string, MiddlewareHandler>();
  const entries = Array.isArray(input)
    ? input.map((item) => [item.name, item.handler] as const)
    : Object.entries(input);
  for (const [name, handler] of entries) {
    if (!FRAMEWORK_MIDDLEWARE_ORDER.some((expected) => expected === name)) {
      throw new TypeError(`Unknown framework middleware "${name}".`);
    }
    if (result.has(name)) throw new TypeError(`Duplicate framework middleware "${name}".`);
    result.set(name, handler);
  }
  return result;
}
