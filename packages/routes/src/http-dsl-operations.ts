import { Effect } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { HttpMappingNode, HttpResponseMapping, HttpTransformRef } from "./http-dsl.types.js";
import { httpSourceEffects } from "./http-dsl-source-operations.js";
import { httpValue } from "./http-dsl-values.js";
import { routeTry } from "./route-observability.js";

/** Effect implementations for each HTTP mapping constructor.
 * @example Effect.runSync(httpEffects.input({ id: httpEffects.path("id") }));
 */
export const httpEffects = {
  ...httpSourceEffects,
  /** Builds a JSON constant mapping.
   * @param value - JSON-compatible value.
   * @returns Effect yielding a constant mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.constant("all"));
   */
  constant: Effect.fn("routes.dsl.constant")(<const V extends JsonValue>(value: V) =>
    routeTry("dsl.constant", () => httpValue.constant(value)),
  ),
  /** Wraps a mapping as optional.
   * @param value - Existing mapping node.
   * @returns Effect yielding an optional mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.optional(http.path("id")));
   */
  optional: Effect.fn("routes.dsl.optional")(<const M extends HttpMappingNode>(value: M) =>
    routeTry("dsl.optional", () => httpValue.optional(value)),
  ),
  /** Wraps a mapping with a fallback.
   * @param value - Existing mapping node.
   * @param fallback - JSON-compatible fallback.
   * @returns Effect yielding a default mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.default(http.path("id"), "none"));
   */
  default: Effect.fn("routes.dsl.default")(
    <const M extends HttpMappingNode, const V extends JsonValue>(value: M, fallback: V) =>
      routeTry("dsl.default", () => httpValue.default(value, fallback)),
  ),
  /** Applies a registered transform to a mapping.
   * @param transform - Transform reference or stable ID.
   * @param value - Optional input mapping.
   * @returns Effect yielding a transform mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.transform("text.upper"));
   */
  transform: Effect.fn("routes.dsl.transform")(
    <const T extends HttpTransformRef | string, const M extends HttpMappingNode>(
      transform: T,
      value?: M,
    ) => routeTry("dsl.transform", () => httpValue.transform(transform, value)),
  ),
  /** Defines a successful response mapping.
   * @param status - HTTP status.
   * @param schema - Optional response schema.
   * @returns Effect yielding a response mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.success(200));
   */
  success: Effect.fn("routes.dsl.success")((status: number, schema?: StandardSchemaV1) =>
    routeTry("dsl.response", () => httpValue.success(status, schema)),
  ),
  /** Defines an error response mapping.
   * @param errorId - Stable error ID.
   * @param status - HTTP status.
   * @param schema - Optional response schema.
   * @returns Effect yielding an error mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.error("not-found", 404));
   */
  error: Effect.fn("routes.dsl.error")(
    (errorId: string, status: number, schema?: StandardSchemaV1) =>
      routeTry("dsl.response", () => httpValue.error(errorId, status, schema)),
  ),
  /** Defines a validation-error response mapping.
   * @param status - Optional HTTP status.
   * @param schema - Optional response schema.
   * @returns Effect yielding a validation-error mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.validationError());
   */
  validationError: Effect.fn("routes.dsl.validation-error")(
    (status?: number, schema?: StandardSchemaV1) =>
      routeTry("dsl.response", () => httpValue.validationError(status, schema)),
  ),
  /** Defines a named response mapping.
   * @param id - Stable response ID.
   * @param status - HTTP status.
   * @param schema - Optional response schema.
   * @returns Effect yielding a response mapping or RouteOperationError.
   * @example Effect.runSync(httpEffects.response("accepted", 202));
   */
  response: Effect.fn("routes.dsl.response")(
    (id: string, status: number, schema?: StandardSchemaV1) =>
      routeTry("dsl.response", () => httpValue.response(id, status, schema)),
  ),
  /** Defines a continue decision.
   * @returns Effect yielding a continue decision or RouteOperationError.
   * @example Effect.runSync(httpEffects.continue());
   */
  continue: Effect.fn("routes.dsl.continue")(() =>
    routeTry("dsl.continue", () => httpValue.continue()),
  ),
  /** Defines a response decision.
   * @param response - Response mapping or stable response ID.
   * @param body - Optional body mapping.
   * @returns Effect yielding a response decision or RouteOperationError.
   * @example Effect.runSync(httpEffects.respond("accepted"));
   */
  respond: Effect.fn("routes.dsl.respond")(
    (response: HttpResponseMapping | string, body?: HttpMappingNode) =>
      routeTry("dsl.respond", () => httpValue.respond(response, body)),
  ),
};
