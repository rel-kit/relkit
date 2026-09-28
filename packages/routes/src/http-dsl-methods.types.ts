import type { JsonValue } from "@relkit/contracts";
import type { HttpDslSources } from "./http-dsl-sources.types.js";
import type { StandardSchemaV1 } from "@relkit/schema";
import type {
  HttpMappingShape,
  HttpMappingNode,
  HttpConstantMapping,
  HttpOptionalMapping,
  HttpDefaultMapping,
  HttpTransformMapping,
  HttpInputMapping,
  HttpNestedMapping,
} from "./http-mapping.types.js";
import type {
  HttpTransformRef,
  HttpResponseMapping,
  ContinueMapping,
  RespondMapping,
  TransformOutput,
} from "./http-dsl.types.js";

/** Constructor methods for serializable HTTP mappings.
 * @example const request = http.input({ id: http.path("id") });
 */
export interface HttpDslMethods extends HttpDslSources {
  /** Named request fields.
   * @param fields - Serializable field mappings.
   * @returns An input mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.input({ id: http.path("id") });
   */
  input<const S extends HttpMappingShape>(fields: S): HttpInputMapping<S>;
  /** Named nested fields.
   * @param fields - Serializable field mappings.
   * @returns A nested object mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.nested({ id: http.path("id") });
   */
  nested<const S extends HttpMappingShape>(fields: S): HttpNestedMapping<S>;
  /** A serializable constant.
   * @param value - JSON-compatible value.
   * @returns A constant mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.constant("all");
   */
  constant<const V extends JsonValue>(value: V): HttpConstantMapping<V>;
  /** An optional source value.
   * @param value - Existing mapping node.
   * @returns An optional mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.optional(http.query("page"));
   */
  optional<const M extends HttpMappingNode>(value: M): HttpOptionalMapping<M>;
  /** A source value with a fallback.
   * @param value - Existing mapping node
   * @param fallback - JSON-compatible default.
   * @returns A default mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.default(http.query("page"), "1");
   */
  default<const M extends HttpMappingNode, const V extends JsonValue>(
    value: M,
    fallback: V,
  ): HttpDefaultMapping<M, V>;
  /** A registered transformation.
   * @param transform - Reference or stable ID
   * @param value - Optional input mapping.
   * @returns A transform mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.transform("text.upper", http.body("name"));
   */
  transform<const T extends HttpTransformRef | string, const M extends HttpMappingNode>(
    transform: T,
    value?: M,
  ): HttpTransformMapping<TransformOutput<T>>;
  /** A successful response.
   * @param status - HTTP status
   * @param schema - Optional body schema.
   * @returns A response mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.success(200);
   */
  success(status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  /** An error response.
   * @param errorId - Stable error ID
   * @param status - HTTP status
   * @param schema - Optional body schema.
   * @returns An error response mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.error("not-found", 404);
   */
  error(errorId: string, status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  /** A validation failure response.
   * @param status - HTTP status
   * @param schema - Optional body schema.
   * @returns A validation-error mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.validationError(422);
   */
  validationError(status?: number, schema?: StandardSchemaV1): HttpResponseMapping;
  /** A named response.
   * @param id - Stable response ID
   * @param status - HTTP status
   * @param schema - Optional body schema.
   * @returns A named response mapping.
   * @throws TypeError when the mapping input is invalid.
   * @example http.response("accepted", 202);
   */
  response(id: string, status: number, schema?: StandardSchemaV1): HttpResponseMapping;
  /** A middleware continue decision.
   * @returns A continue decision.
   * @example http.continue();
   */
  continue(): ContinueMapping;
  /** A middleware response decision.
   * @param response - Mapping or stable response ID
   * @param body - Optional body mapping.
   * @returns A respond decision.
   * @throws TypeError when the mapping input is invalid.
   * @example http.respond("accepted");
   */
  respond(response: HttpResponseMapping | string, body?: HttpMappingNode): RespondMapping;
}
