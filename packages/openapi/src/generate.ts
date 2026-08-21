import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  type JsonValue,
} from "@zsys/contracts";
import type { ApplicationGraph, FunctionNode, GraphNode, HttpTriggerConfig } from "@zsys/graph";
import { buildOperation, openApiPath } from "./generate-utils.js";
import { documentTags, type OpenApiTag } from "./generate-tags.js";
import { serviceContext, serviceFor } from "./generate-services.js";

export type OpenApiSchema = { readonly [key: string]: JsonValue };
export interface OpenApiParameter {
  readonly name: string;
  readonly in: "path" | "query" | "header" | "cookie";
  readonly required: boolean;
  readonly schema: OpenApiSchema;
}
export interface OpenApiMediaType {
  readonly schema: OpenApiSchema;
}
export interface OpenApiResponse {
  readonly description: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
  readonly headers?: Readonly<
    Record<string, { readonly description: string; readonly schema: OpenApiSchema }>
  >;
}
export interface OpenApiOperation {
  readonly operationId: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required: boolean;
    readonly content: Readonly<Record<string, OpenApiMediaType>>;
  };
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
  readonly "x-zsys": {
    readonly routeId: string;
    readonly functionId: string;
    readonly serviceId?: string;
    readonly middleware: readonly { readonly id: string; readonly targetFunctionId: string }[];
    readonly transforms: readonly string[];
    readonly rateLimit?: JsonValue;
  };
}
export interface OpenApiPathItem {
  readonly [method: string]: OpenApiOperation | undefined;
}
export interface OpenApiDocument {
  readonly openapi: "3.1.0";
  readonly info: { readonly title: string; readonly version: string };
  readonly jsonSchemaDialect: string;
  readonly tags?: readonly OpenApiTag[];
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
  readonly "x-zsys": {
    readonly version: number;
    readonly contractVersion: number;
    readonly graphVersion: number;
    readonly generatorVersion: number;
  };
}
export type HttpGraphTrigger = Extract<GraphNode, { readonly kind: "trigger" }> & {
  readonly triggerType: "http";
  readonly config: HttpTriggerConfig;
};
export type { OpenApiTag } from "./generate-tags.js";

/** Generates a deterministic OpenAPI 3.1 document from the serializable graph contract. */
export function generateOpenApi(graph: ApplicationGraph): OpenApiDocument {
  const functions = new Map(
    graph.nodes
      .filter((node): node is FunctionNode => node.kind === "function")
      .map((node) => [node.id, node]),
  );
  const triggers = graph.nodes
    .filter(isHttpTrigger)
    .sort(
      (left, right) =>
        openApiPath(left.config.path).localeCompare(openApiPath(right.config.path)) ||
        left.config.method.localeCompare(right.config.method) ||
        left.id.localeCompare(right.id),
    );
  const services = serviceContext(graph);
  const paths: Record<string, OpenApiPathItem> = {};
  for (const trigger of triggers) {
    const target = functions.get(trigger.targetFunctionId);
    if (target === undefined) {
      throw new TypeError(
        `HTTP trigger "${trigger.id}" targets missing function "${trigger.targetFunctionId}".`,
      );
    }
    const service = serviceFor(services, trigger, target);
    for (const [index, routePath] of openApiPaths(trigger.config.path).entries()) {
      const path = openApiPath(routePath);
      const method = trigger.config.method.toLowerCase();
      const item = paths[path] ?? {};
      if (item[method] !== undefined)
        throw new TypeError(`Duplicate OpenAPI route "${method.toUpperCase()} ${path}".`);
      paths[path] = {
        ...item,
        [method]: buildOperation(
          trigger,
          target,
          routePath,
          index === 0 ? trigger.id : `${trigger.id}.catch-all`,
          service,
        ),
      };
    }
  }
  const tags = documentTags(
    services.sources,
    triggers.flatMap((trigger) => trigger.config.tags ?? []),
  );
  return {
    openapi: "3.1.0",
    info: { title: graph.appId ?? "ZSys application", version: String(CONTRACT_VERSION) },
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    ...(tags.length === 0 ? {} : { tags }),
    paths,
    "x-zsys": {
      version: CONTRACT_VERSION,
      contractVersion: CONTRACT_VERSION,
      graphVersion: GRAPH_VERSION,
      generatorVersion: GENERATOR_VERSION,
    },
  };
}

function openApiPaths(path: string): readonly string[] {
  const segments = path.split("/");
  const optional = segments.findIndex(
    (segment) => segment.startsWith("*") && segment.endsWith("?"),
  );
  if (optional < 0) return [path];
  const base = segments.slice(0, optional).join("/") || "/";
  return [base, path.replace(/\?$/, "")];
}

/** Serializes OpenAPI with the repository's canonical JSON ordering. */
export function generateOpenApiJson(graph: ApplicationGraph): string {
  return `${canonicalJson(generateOpenApi(graph) as unknown as JsonValue)}\n`;
}

function isHttpTrigger(node: GraphNode): node is HttpGraphTrigger {
  return node.kind === "trigger" && node.triggerType === "http";
}
