import type { DescriptorMetadata } from "@relkit/contracts";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { HttpMappingNode } from "./http-mapping.types.js";
import type { HttpDslMethods } from "./http-dsl-methods.types.js";

export type * from "./http-mapping.types.js";

/** HTTP methods recognized by the compiler.
 * @example const method: HttpMethod = "GET";
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL";
/** Supported explicit request content types.
 * @example const accept: HttpRequestContentType = "application/json";
 */
export type HttpRequestContentType = "application/json" | "multipart/form-data";
/** Stable serializable transform identity.
 * @example const ref: TransformReference = { kind: "transform", id: "text.upper" };
 */
export interface TransformReference<Id extends string = string> {
  readonly kind: "transform";
  readonly id: Id;
}
/** Transform reference paired with its output schema.
 * @example const ref: HttpTransformRef = { ref: transform.ref, schema: transform.schema };
 */
export interface HttpTransformRef<
  Id extends string = string,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ref: TransformReference<Id>;
  readonly schema: Schema;
}
/** Frozen authoring descriptor for a transform.
 * @example type Upper = HttpTransformDescriptor<"text.upper", typeof schema>;
 */
export interface HttpTransformDescriptor<
  Id extends string,
  Schema extends StandardSchemaV1,
> extends HttpTransformRef<Id, Schema> {
  readonly kind: "transform";
  readonly id: Id;
}
/** Output type inferred from a transform schema.
 * @example type Output = TransformOutput<typeof transform>;
 */
export type TransformOutput<T> = T extends { readonly schema: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;
/** Authoring options for a serializable transform.
 * @example type Options = DefineTransformOptions<"text.upper", typeof schema>;
 */
export interface DefineTransformOptions<
  Id extends string,
  Schema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly schema: Schema;
}

/** Serializable response status and schema mapping.
 * @example const response: HttpResponseMapping = http.success(200);
 */
export interface HttpResponseMapping {
  readonly kind: "success" | "error" | "validation-error" | "response";
  readonly id: string;
  readonly status: number;
  readonly errorId?: string;
  readonly schema?: StandardSchemaV1;
}
/** Middleware decision that delegates to the next handler.
 * @example const decision: ContinueMapping = http.continue();
 */
export interface ContinueMapping {
  readonly kind: "continue";
}
/** Middleware decision selecting a response mapping.
 * @example const decision: RespondMapping = http.respond("success.200");
 */
export interface RespondMapping {
  readonly kind: "respond";
  readonly responseId: string;
  readonly body?: HttpMappingNode;
}
/** Union of middleware response decisions.
 * @example const decision: MiddlewareDecisionMapping = http.continue();
 */
export type MiddlewareDecisionMapping = ContinueMapping | RespondMapping;

/** Synchronous HTTP mapping constructor API.
 * @example const request = http.input({ id: http.path("id") });
 */
export interface HttpDsl extends HttpDslMethods {}
