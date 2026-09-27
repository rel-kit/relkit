import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";
import type { HttpMappingNode, HttpRequestMapping } from "./http-dsl.types.js";
import { isJsonValue, isRecordValue, ownKeys } from "./http-dsl-value-validation.js";

/** Checks a serializable mapping through Effect.
 * @param value - Candidate mapping.
 * @returns Whether the mapping is valid.
 * @example Effect.runSync(isHttpMappingEffect(http.path("id")));
 */
export const isHttpMappingEffect = Effect.fn("routes.validation.is-mapping")((value: unknown) =>
  routeTry("validation.is-mapping", () => isHttpMappingValue(value)),
);

/** Checks a serializable mapping synchronously.
 * @param value - Candidate mapping.
 * @returns Whether the mapping is valid.
 * @example isHttpMapping(http.path("id"));
 */
export function isHttpMapping(value: unknown): value is HttpMappingNode {
  return runRouteSync(isHttpMappingEffect(value));
}

function isHttpMappingValue(value: unknown): value is HttpMappingNode {
  if (!isRecordValue(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "path":
    case "path-segments":
    case "query":
    case "header":
    case "cookie":
    case "body":
    case "multipart":
    case "multipart-all":
      return (
        ownKeys(value, "kind", "name") && typeof value.name === "string" && value.name.length > 0
      );
    case "whole-body":
      return ownKeys(value, "kind");
    case "constant":
      return ownKeys(value, "kind", "value") && isJsonValue(value.value);
    case "input":
    case "nested":
      return ownKeys(value, "kind", "fields") && isFields(value.fields);
    case "optional":
      return ownKeys(value, "kind", "value") && isMappingValue(value.value);
    case "default":
      return (
        ownKeys(value, "kind", "value", "default") &&
        isMappingValue(value.value) &&
        isJsonValue(value.default)
      );
    case "transform":
      return (
        ownKeys(value, "kind", "transformId", "value") &&
        isStableId(value.transformId) &&
        isMappingValue(value.value)
      );
    default:
      return false;
  }
}
/** Asserts a serializable mapping through Effect.
 * @param value - Candidate mapping.
 * @returns Void or tagged invalid-input failure.
 * @example Effect.runSync(assertMappingEffect(http.path("id")));
 */
export const assertMappingEffect = Effect.fn("routes.validation.assert-mapping")((value: unknown) =>
  routeTry("validation.assert-mapping", () => assertMappingValue(value)),
);

/** Asserts a serializable mapping synchronously.
 * @param value - Candidate mapping.
 * @returns Nothing when valid.
 * @throws TypeError for invalid mapping values.
 * @example assertMapping(http.path("id"));
 */
export function assertMapping(value: unknown): asserts value is HttpMappingNode {
  runRouteSync(assertMappingEffect(value));
}

/** Validates a mapping inside an already observed operation.
 * @param value - Candidate mapping.
 * @returns Nothing when valid.
 * @throws RouteInputError for an invalid mapping.
 * @example assertMappingValue({ kind: "path", name: "id" });
 */
export function assertMappingValue(value: unknown): asserts value is HttpMappingNode {
  if (!isHttpMappingValue(value))
    throw new RouteInputError("HTTP mapping must be serializable and closure-free");
}

/** Checks a request input mapping through Effect.
 * @param value - Candidate mapping.
 * @returns Whether the mapping is a request input.
 * @example Effect.runSync(isHttpRequestMappingEffect(http.input({})));
 */
export const isHttpRequestMappingEffect = Effect.fn("routes.validation.is-request")(
  (value: unknown) => routeTry("validation.is-request", () => isRequestValue(value)),
);

/** Checks a request input mapping synchronously.
 * @param value - Candidate mapping.
 * @returns Whether the mapping is a request input.
 * @example isHttpRequestMapping(http.input({}));
 */
export function isHttpRequestMapping(value: unknown): value is HttpRequestMapping {
  return runRouteSync(isHttpRequestMappingEffect(value));
}
function isRequestValue(value: unknown): value is HttpRequestMapping {
  return isHttpMappingValue(value) && value.kind === "input";
}

/** Asserts a request input mapping through Effect.
 * @param value - Candidate mapping.
 * @returns Void or tagged invalid-input failure.
 * @example Effect.runSync(assertRequestMappingEffect(http.input({})));
 */
export const assertRequestMappingEffect = Effect.fn("routes.validation.assert-request")(
  (value: unknown) => routeTry("validation.assert-request", () => assertRequestMappingValue(value)),
);

/** Asserts a request input mapping synchronously.
 * @param value - Candidate mapping.
 * @returns Nothing when valid.
 * @throws TypeError for invalid request mappings.
 * @example assertRequestMapping(http.input({}));
 */
export function assertRequestMapping(value: unknown): asserts value is HttpRequestMapping {
  runRouteSync(assertRequestMappingEffect(value));
}

/** Validates a request mapping inside an already observed operation.
 * @param value - Candidate request mapping.
 * @returns Nothing when valid.
 * @throws RouteInputError for an invalid request mapping.
 * @example assertRequestMappingValue({ kind: "input", fields: {} });
 */
export function assertRequestMappingValue(value: unknown): asserts value is HttpRequestMapping {
  if (!isRequestValue(value))
    throw new RouteInputError("Route request must be a serializable HTTP input mapping");
}
/** Checks a non-root mapping during recursive validation.
 * @param value - Candidate nested mapping.
 * @returns Whether it is a valid non-input mapping.
 * @example isMappingValue(http.path("id"));
 */
export function isMappingValue(value: unknown): value is HttpMappingNode {
  return isHttpMappingValue(value) && value.kind !== "input";
}
function isFields(value: unknown): boolean {
  return (
    isRecordValue(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.entries(value).every(([name, mapping]) => name.length > 0 && isMappingValue(mapping))
  );
}
