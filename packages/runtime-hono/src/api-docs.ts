/**
 * Installs protected JSON and explicitly selected reference routes independently.
 * Configuration is validated before registration; authorization precedes lazy
 * document generation through ApiDocuments, executed at each HTTP request edge.
 */
import {
  API_BASE_PATH,
  API_VERSION,
  assertJsonValue,
  canonicalJson,
  type JsonValue,
} from "@relkit/contracts";
import type { RegistrationPlan } from "@relkit/graph";
import { Effect, Layer } from "effect";
import type { Context, Hono, Next } from "hono";
import type { ApiDocsOptions, ApiReferenceFactory } from "./api-docs.types.js";
import { ApiDocuments, documentFrom } from "./api-docs-document.js";
import { runHttp } from "./http-effect.js";
import { isAuthorized, jsonResponse } from "./internal-endpoints-utils.js";
import type { InternalEndpointMode, InternalEndpointOptions } from "./internal-endpoints.js";
export type { ApiDocsOptions } from "./api-docs.types.js";

export const OPENAPI_PATH = `${API_BASE_PATH}/openapi.json` as const;
export const API_REFERENCE_PATH = `${API_BASE_PATH}/api-reference` as const;

export class ApiDocsConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ApiDocsConfigurationError";
  }
}

/** Installs the active OpenAPI document and an explicitly supplied optional reference UI.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param plan - Validated application registration plan.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; registers the document and reference UI only when exposure is enabled.
 */
export function installApiDocs(
  app: Hono,
  plan: RegistrationPlan,
  options: ApiDocsOptions = {},
): void {
  const mode = options.mode ?? "development";
  const enabled =
    mode === "production" ? options.enabledInProduction === true : options.enabled !== false;
  validate(mode, enabled, options);
  if (!enabled) return;
  if (options.ui === "scalar" && options.reference === undefined)
    throw new ApiDocsConfigurationError(
      "Scalar UI requires createPreparedApp or @relkit/runtime-hono/scalar.",
    );
  const baseDocument = options.document ?? documentFrom(plan);
  assertJsonValue(baseDocument);
  const documents = Layer.effect(ApiDocuments, ApiDocuments.make(baseDocument, options));
  const document = (signal: AbortSignal) =>
    runHttp(ApiDocuments.use((service) => service.get()).pipe(Effect.provide(documents)), signal);
  const auth = authorization(options);
  const embed =
    mode === "production" || auth.bearerToken !== undefined || auth.authorize !== undefined;
  registerDocumentRoutes(
    app,
    document,
    auth,
    embed,
    options.ui === false ? undefined : options.reference,
  );
}

/**
 * Registers both representations behind the same authorization barrier.
 * @param app - Hono application with already validated exposure policy.
 * @param document - Lazy JSON reader executed only for an authorized request.
 * @param auth - Existing internal endpoint authorization policy.
 * @param embed - Whether Scalar must embed JSON to avoid a second protected fetch.
 * @param reference - Explicitly supplied optional UI factory.
 * @returns Nothing; installs JSON and, when supplied, the optional UI handler.
 */
function registerDocumentRoutes(
  app: Hono,
  document: (signal: AbortSignal) => Promise<JsonValue>,
  auth: InternalEndpointOptions,
  embed: boolean,
  reference?: ApiReferenceFactory,
): void {
  /** Require the configured inspector authorization before serving API documentation.
   * @param handler - Document or reference-UI handler to run after authorization.
   * @returns A handler yielding the protected response or a bearer-authentication challenge.
   */
  const protect =
    (handler: (context: Context, next: Next) => Promise<Response | void>) =>
    async (context: Context, next: Next): Promise<Response | void> => {
      if (!(await isAuthorized(context.req.raw, auth))) {
        return jsonResponse({ error: "internal-endpoint-protected" }, 401, {
          "www-authenticate": "Bearer",
        });
      }
      return handler(context, next);
    };

  app.get(
    OPENAPI_PATH,
    protect(
      async (context) =>
        new Response(canonicalJson(await document(context.req.raw.signal)), {
          headers: responseHeaders("application/json"),
        }),
    ),
  );
  if (reference === undefined) return;
  app.get(
    API_REFERENCE_PATH,
    protect(async (context, next) => {
      const render = reference({
        ...(embed
          ? { content: canonicalJson(await document(context.req.raw.signal)) }
          : { url: "./openapi.json" }),
        pageTitle: "RELKIT API Reference",
      });
      const response = await render(context, next);
      if (!(response instanceof Response)) return response;
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          ...responseHeaders("text/html; charset=UTF-8"),
        },
      });
    }),
  );
}

/** Selects the configured API-document authorization policy.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The API-document bearer token and authorization callback in inspector option form.
 */
function authorization(options: ApiDocsOptions): InternalEndpointOptions {
  return {
    ...(options.bearerToken === undefined ? {} : { bearerToken: options.bearerToken }),
    ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
  };
}

/** Checks API-document exposure configuration before routes are installed.
 * @param mode - Configured runtime exposure or response-validation mode.
 * @param enabled - Whether the feature is enabled by application configuration.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing for a valid exposure policy; invalid production protection or mode throws.
 */
function validate(mode: InternalEndpointMode, enabled: boolean, options: ApiDocsOptions): void {
  if (!(mode === "development" || mode === "test" || mode === "production")) {
    throw new ApiDocsConfigurationError("mode must be development, test, or production.");
  }
  if (
    mode === "production" &&
    enabled &&
    options.bearerToken === undefined &&
    options.authorize === undefined
  ) {
    throw new ApiDocsConfigurationError(
      "Production API docs require existing internal-endpoint authorization.",
    );
  }
  if (options.bearerToken !== undefined && options.bearerToken.trim() === "") {
    throw new ApiDocsConfigurationError("bearerToken must not be empty.");
  }
}

/** Builds response headers for the selected API-document representation.
 * @param contentType - Media type advertised by the resulting response.
 * @returns No-store headers containing the selected content type and RELKIT API version.
 */
function responseHeaders(contentType: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-relkit-api-version": String(API_VERSION),
  };
}
