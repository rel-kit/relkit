/**
 * Owns lazy document generation for JSON and embedded Scalar responses. Shared
 * application metadata is captured at construction; native auth metadata is
 * requested per authorized call. Foreign failures remain HttpBoundaryError and
 * the HTTP transport owns execution/cancellation and its configured logger.
 */
import { assertJsonValue, type JsonValue } from "@relkit/contracts";
import type { RegistrationPlan } from "@relkit/graph";
import { generateOpenApi } from "@relkit/openapi";
import { GRAPH_VERSION } from "@relkit/contracts";
import { Context, Effect } from "effect";
import { mergeAuthDocument } from "./api-docs-auth.js";
import type { ApiDocsOptions } from "./api-docs.types.js";
import { httpBoundary, HttpBoundaryError, observeHttp } from "./http-effect.js";

/** Shared documentation projection; no session/request identity is captured. */
export class ApiDocuments extends Context.Service<
  ApiDocuments,
  {
    /**
     * Resolves one application document without capturing request identity.
     * @returns Lazy JSON metadata, or HttpBoundaryError on native generation/merge failure.
     */
    readonly get: () => Effect.Effect<JsonValue, HttpBoundaryError>;
  }
>()("relkit/http/ApiDocuments", {
  /**
   * Captures static metadata and native lookup policy without calling auth.
   * @param base - Validated application JSON document.
   * @param options - Exposure policy, native lookup and excluded service IDs.
   * @returns Methods that retain HTTP execution context at each request.
   */
  make: (base: JsonValue, options: ApiDocsOptions) =>
    Effect.succeed({
      get: Effect.fn("ApiDocuments.get")(
        function* () {
          let document = base;
          const readAuth = options.getAuthDocument;
          if (readAuth !== undefined) {
            const auth = yield* httpBoundary("api.docs.auth", () => readAuth());
            document = yield* Effect.try({
              try: () => mergeAuthDocument(base, auth),
              catch: (cause) => new HttpBoundaryError({ operation: "api.docs.merge", cause }),
            });
          }
          return filterDomains(document, options.excludeDomains);
        },
        (effect) => observeHttp("api.docs.document", effect),
      ),
    }),
}) {}

/**
 * Builds application metadata from callable targets and raw HTTP registrations.
 * @param plan - Validated registration plan supplied by application construction.
 * @returns A JSON-safe application document without acquiring native services.
 */
export function documentFrom(plan: RegistrationPlan): JsonValue {
  const functions = new Set(plan.functions.map(({ id }) => id));
  const document = generateOpenApi({
    contractVersion: GRAPH_VERSION,
    nodes: [
      ...plan.functions,
      ...plan.httpTriggers
        .filter(
          ({ config, targetFunctionId }) =>
            (config !== null &&
              typeof config === "object" &&
              "rawHandler" in config &&
              config.rawHandler === true) ||
            functions.has(targetFunctionId),
        )
        .map((trigger) => {
          assertJsonValue(trigger.config);
          return { ...trigger, config: trigger.config };
        }),
      ...(plan.services ?? []),
    ],
    edges: [],
  });
  assertJsonValue(document);
  return document;
}

/**
 * Removes excluded service operations and their now-unused tags.
 * @param document - Validated JSON document after optional auth merge.
 * @param excluded - Service identities hidden from the shared reference.
 * @returns Detached filtered metadata, or the original when filtering is unnecessary.
 */
function filterDomains(document: JsonValue, excluded: readonly string[] = []): JsonValue {
  if (excluded.length === 0 || !isRecord(document) || !isRecord(document.paths)) return document;
  const domains = new Set(excluded);
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  const paths = Object.fromEntries(
    Object.entries(document.paths).flatMap<[string, JsonValue]>(([path, item]) => {
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
  };
}

/** Recognizes a validated JSON object before path/tag projection. */
function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
