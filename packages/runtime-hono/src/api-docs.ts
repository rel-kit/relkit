import { Scalar } from "@scalar/hono-api-reference";
import {
  API_BASE_PATH,
  API_VERSION,
  CONTRACT_VERSION,
  canonicalJson,
  type JsonValue,
} from "@relkit/contracts";
import type { ApplicationGraph, RegistrationPlan } from "@relkit/graph";
import { generateOpenApi, type OpenApiDocument } from "@relkit/openapi";
import type { Context, Hono, Next } from "hono";
import { isAuthorized, jsonResponse } from "./internal-endpoints-utils.js";
import type { InternalEndpointMode, InternalEndpointOptions } from "./internal-endpoints.js";

export const OPENAPI_PATH = `${API_BASE_PATH}/openapi.json` as const;
export const API_REFERENCE_PATH = `${API_BASE_PATH}/api-reference` as const;

export interface ApiDocsOptions {
  readonly mode?: InternalEndpointMode;
  readonly enabled?: boolean;
  readonly enabledInProduction?: boolean;
  readonly excludeDomains?: readonly string[];
  readonly bearerToken?: string;
  readonly authorize?: InternalEndpointOptions["authorize"];
  readonly document?: OpenApiDocument | JsonValue;
}

export class ApiDocsConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ApiDocsConfigurationError";
  }
}

/** Installs the active OpenAPI document and the sole bundled Scalar reference UI. */
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
  const document = filterDomains(options.document ?? documentFrom(plan), options.excludeDomains);
  const auth = authorization(options);
  const embed =
    mode === "production" || auth.bearerToken !== undefined || auth.authorize !== undefined;
  const reference = Scalar({
    ...(embed ? { content: canonicalJson(document as JsonValue) } : { url: "./openapi.json" }),
    pageTitle: "RELKIT API Reference",
  });
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
      async () =>
        new Response(canonicalJson(document as JsonValue), {
          headers: responseHeaders("application/json"),
        }),
    ),
  );
  app.get(
    API_REFERENCE_PATH,
    protect(async (context, next) => {
      const response = await reference(context, next);
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

function documentFrom(plan: RegistrationPlan): OpenApiDocument {
  const functions = new Set(plan.functions.map(({ id }) => id));
  return generateOpenApi({
    contractVersion: CONTRACT_VERSION,
    nodes: [
      ...plan.functions,
      ...plan.httpTriggers.filter(({ targetFunctionId }) => functions.has(targetFunctionId)),
      ...(plan.services ?? []),
    ],
    edges: [],
  } as unknown as ApplicationGraph);
}

function authorization(options: ApiDocsOptions): InternalEndpointOptions {
  return {
    ...(options.bearerToken === undefined ? {} : { bearerToken: options.bearerToken }),
    ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
  };
}

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

function responseHeaders(contentType: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-relkit-api-version": String(API_VERSION),
  };
}

function filterDomains(
  document: OpenApiDocument | JsonValue,
  excluded: readonly string[] = [],
): OpenApiDocument | JsonValue {
  if (excluded.length === 0 || !isRecord(document) || !isRecord(document.paths)) return document;
  const domains = new Set(excluded);
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  const paths = Object.fromEntries(
    Object.entries(document.paths).flatMap<[string, unknown]>(([path, item]) => {
      if (!isRecord(item)) return [[path, item]];
      const entries = Object.entries(item);
      const kept = entries.filter(([method, operation]) => {
        if (!methods.has(method) || !isRecord(operation)) return true;
        const metadata = operation["x-relkit"];
        return (
          !isRecord(metadata) ||
          typeof metadata.serviceId !== "string" ||
          !domains.has(metadata.serviceId)
        );
      });
      if (kept.length < entries.length && !kept.some(([method]) => methods.has(method))) return [];
      return [[path, Object.fromEntries(kept)]];
    }),
  );
  const usedTags = new Set(
    Object.values(paths).flatMap((item) =>
      !isRecord(item)
        ? []
        : Object.entries(item).flatMap(([method, operation]) =>
            methods.has(method) && isRecord(operation) && Array.isArray(operation.tags)
              ? operation.tags
              : [],
          ),
    ),
  );
  return {
    ...document,
    paths,
    ...(Array.isArray(document.tags)
      ? { tags: document.tags.filter((tag) => isRecord(tag) && usedTags.has(tag.name)) }
      : {}),
  } as JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
