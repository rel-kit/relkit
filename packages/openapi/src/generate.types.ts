import type { JsonValue } from "@relkit/contracts";
import type { GraphNode, HttpTriggerConfig } from "@relkit/graph";
import type { OpenApiTag } from "./generate-tags.types.js";

export type { JsonValue } from "@relkit/contracts";
export type { ApplicationGraph, FunctionNode, GraphNode } from "@relkit/graph";

/** JSON Schema object emitted in an OpenAPI document.
 * @example const schema: OpenApiSchema = { type: "string" };
 */
export type OpenApiSchema = { readonly [key: string]: JsonValue };

/** A parameter projected from a route or request mapping.
 * @example const parameter: OpenApiParameter = { name: "id", in: "path", required: true, schema: { type: "string" } };
 */
export interface OpenApiParameter {
  readonly name: string;
  readonly in: "path" | "query" | "header" | "cookie";
  readonly required: boolean;
  readonly schema: OpenApiSchema;
}

/** A response or request media type with its schema.
 * @example const media: OpenApiMediaType = { schema: { type: "object" } };
 */
export interface OpenApiMediaType {
  readonly schema: OpenApiSchema;
}

/** One documented HTTP response, including optional headers.
 * @example const response: OpenApiResponse = { description: "Created" };
 */
export interface OpenApiResponse {
  readonly description: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
  readonly headers?: Readonly<
    Record<string, { readonly description: string; readonly schema: OpenApiSchema }>
  >;
}

/** One documented route operation and RELKIT provenance.
 * @example const operation = generateOpenApi(graph).paths["/orders"]?.get;
 */
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
  readonly "x-relkit": {
    readonly routeId: string;
    readonly functionId?: string;
    readonly serviceId?: string;
    readonly middleware: readonly {
      readonly id: string;
      readonly path: string;
      readonly order: number;
      readonly match: "always" | "conditional";
    }[];
    readonly transforms: readonly string[];
    readonly rateLimit?: JsonValue;
  };
}

/** HTTP methods indexed by a normalized OpenAPI path.
 * @example const item = generateOpenApi(graph).paths["/orders"];
 */
export interface OpenApiPathItem {
  readonly [method: string]: OpenApiOperation | undefined;
}

/** Complete deterministic OpenAPI 3.1 projection of a RELKIT graph.
 * @example const document: OpenApiDocument = generateOpenApi(graph);
 */
export interface OpenApiDocument {
  readonly openapi: "3.1.0";
  readonly info: { readonly title: string; readonly version: string };
  readonly jsonSchemaDialect: string;
  readonly tags?: readonly OpenApiTag[];
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
  readonly "x-relkit": {
    readonly version: number;
    readonly contractVersion: number;
    readonly graphVersion: number;
    readonly generatorVersion: number;
  };
}

/** Graph trigger with HTTP configuration after runtime narrowing.
 * @example const trigger: HttpGraphTrigger = httpTrigger;
 */
export type HttpGraphTrigger = Extract<GraphNode, { readonly kind: "trigger" }> & {
  readonly triggerType: "http";
  readonly config: HttpTriggerConfig;
};
