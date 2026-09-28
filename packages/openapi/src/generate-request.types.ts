import type { OpenApiOperation, OpenApiParameter, OpenApiSchema } from "./generate.types.js";

export type { JsonValue } from "@relkit/contracts";
export type {
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSchema,
} from "./generate.types.js";

/** One request body mapping collected from graph metadata.
 * @example const entry: BodyEntry = { kind: "body", name: "sku", schema: { type: "string" }, required: true };
 */
export type BodyEntry = {
  readonly kind: "body" | "multipart" | "multipart-all" | "whole-body";
  readonly name?: string;
  readonly schema: OpenApiSchema;
  readonly required: boolean;
};

/** Parameter and optional body projection for one route.
 * @example const request = Effect.runSync(buildRequestEffect(mapping, input, "/orders/:id"));
 */
export interface OpenApiRequest {
  readonly parameters: OpenApiParameter[];
  readonly body?: OpenApiOperation["requestBody"];
}
