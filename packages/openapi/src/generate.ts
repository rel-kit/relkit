import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
} from "@relkit/contracts";
import { Effect, Result } from "effect";
import { OpenApiGenerationError } from "./generate-error.js";
import { observeOpenApi } from "./generate-observability.js";
import { serviceContextEffect, serviceForEffect } from "./generate-services.js";
import { documentTagsEffect } from "./generate-tags.js";
import { buildOperationEffect, openApiPathEffect } from "./generate-utils.js";
import type {
  ApplicationGraph,
  FunctionNode,
  GraphNode,
  HttpGraphTrigger,
  JsonValue,
  OpenApiDocument,
  OpenApiPathItem,
} from "./generate.types.js";

export type {
  HttpGraphTrigger,
  OpenApiDocument,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiResponse,
  OpenApiSchema,
} from "./generate.types.js";
export type { OpenApiTag } from "./generate-tags.types.js";

/** Generate a deterministic OpenAPI 3.1 document from a graph.
 * @param graph - Serializable RELKIT application graph.
 * @returns Effect containing the document or an OpenApiGenerationError.
 * @example Effect.runSync(generateOpenApiEffect(graph));
 */
export const generateOpenApiEffect = Effect.fn("OpenApi.generate")((graph: ApplicationGraph) =>
  observeOpenApi(
    "generate",
    Effect.gen(function* () {
      const functions = new Map(
        graph.nodes
          .filter((node): node is FunctionNode => node.kind === "function")
          .map((node) => [node.id, node]),
      );
      const triggers = graph.nodes.filter(isHttpTrigger);
      const keyed = yield* Effect.forEach(triggers, (trigger) =>
        Effect.map(openApiPathEffect(trigger.config.path), (path) => ({ trigger, path })),
      );
      keyed.sort(
        (left, right) =>
          left.path.localeCompare(right.path) ||
          left.trigger.config.method.localeCompare(right.trigger.config.method) ||
          left.trigger.id.localeCompare(right.trigger.id),
      );
      const services = yield* serviceContextEffect(graph);
      const paths: Record<string, OpenApiPathItem> = {};
      for (const { trigger } of keyed) {
        const target = trigger.config.rawHandler
          ? undefined
          : functions.get(trigger.targetFunctionId);
        if (target === undefined && !trigger.config.rawHandler)
          return yield* new OpenApiGenerationError({
            reason: "missing-function",
            message: `HTTP trigger "${trigger.id}" targets missing function "${trigger.targetFunctionId}".`,
            triggerId: trigger.id,
            targetFunctionId: trigger.targetFunctionId,
          });
        const service =
          target === undefined ? undefined : yield* serviceForEffect(services, trigger, target);
        for (const [index, routePath] of openApiPaths(trigger.config.path).entries()) {
          const path = yield* openApiPathEffect(routePath);
          const method = trigger.config.method.toLowerCase();
          const item = paths[path] ?? {};
          if (item[method] !== undefined)
            return yield* new OpenApiGenerationError({
              reason: "duplicate-route",
              message: `Duplicate OpenAPI route "${method.toUpperCase()} ${path}".`,
              triggerId: trigger.id,
              method: trigger.config.method,
              path,
            });
          paths[path] = {
            ...item,
            [method]: yield* buildOperationEffect(
              trigger,
              target,
              routePath,
              index === 0 ? trigger.id : `${trigger.id}.catch-all`,
              service,
            ),
          };
        }
      }
      const usedTags = new Set(
        Object.values(paths).flatMap((item) =>
          Object.values(item).flatMap((operation) => operation?.tags ?? []),
        ),
      );
      const tags = (yield* documentTagsEffect(services.sources, [...usedTags])).filter((tag) =>
        usedTags.has(tag.name),
      );
      return {
        openapi: "3.1.0" as const,
        info: { title: graph.appId ?? "RelKit application", version: String(CONTRACT_VERSION) },
        jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
        ...(tags.length === 0 ? {} : { tags }),
        paths,
        "x-relkit": {
          version: CONTRACT_VERSION,
          contractVersion: CONTRACT_VERSION,
          graphVersion: GRAPH_VERSION,
          generatorVersion: GENERATOR_VERSION,
        },
      } satisfies OpenApiDocument;
    }),
  ),
);

/** Synchronous compatibility adapter for graph projection.
 * @param graph - Serializable RELKIT application graph.
 * @returns Deterministic OpenAPI document.
 * @throws TypeError for a missing target function or duplicate route.
 * @example const document = generateOpenApi(graph);
 */
export function generateOpenApi(graph: ApplicationGraph): OpenApiDocument {
  return runGeneration(generateOpenApiEffect(graph));
}

/** Serialize a generated document with canonical JSON ordering.
 * @param graph - Serializable RELKIT application graph.
 * @returns Effect containing newline-terminated JSON or OpenApiGenerationError.
 * @example Effect.runSync(generateOpenApiJsonEffect(graph));
 */
export const generateOpenApiJsonEffect = Effect.fn("OpenApi.serialize")((graph: ApplicationGraph) =>
  observeOpenApi(
    "serialize",
    Effect.gen(function* () {
      const document = yield* generateOpenApiEffect(graph);
      return `${canonicalJson(document as unknown as JsonValue)}\n`;
    }),
  ),
);

/** Synchronous compatibility adapter for canonical OpenAPI JSON.
 * @param graph - Serializable RELKIT application graph.
 * @returns Newline-terminated canonical JSON.
 * @throws TypeError for a missing target function or duplicate route.
 * @example const json = generateOpenApiJson(graph);
 */
export function generateOpenApiJson(graph: ApplicationGraph): string {
  return runGeneration(generateOpenApiJsonEffect(graph));
}

/** Runs a pure generation Effect while retaining legacy TypeError failures. */
function runGeneration<A>(effect: Effect.Effect<A, OpenApiGenerationError>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw new TypeError(result.failure.message);
  return result.success;
}

/** Expand an optional catch-all to its base and populated paths. */
function openApiPaths(path: string): readonly string[] {
  const segments = path.split("/");
  const optional = segments.findIndex(
    (segment) => segment.startsWith("*") && segment.endsWith("?"),
  );
  if (optional < 0) return [path];
  const base = segments.slice(0, optional).join("/") || "/";
  return [base, path.replace(/\?$/, "")];
}

/** Narrow HTTP triggers while excluding provider-owned ALL handlers. */
function isHttpTrigger(node: GraphNode): node is HttpGraphTrigger {
  return (
    node.kind === "trigger" &&
    node.triggerType === "http" &&
    isRecord(node.config) &&
    node.config.method !== "ALL"
  );
}

/** Check for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
