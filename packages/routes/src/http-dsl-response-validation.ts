import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";
import type { HttpResponseMapping, MiddlewareDecisionMapping } from "./http-dsl.types.js";
import { isMappingValue } from "./http-dsl-mapping-validation.js";
import {
  isRecordValue,
  isSchemaValue,
  isStatusValue,
  ownKeys,
} from "./http-dsl-value-validation.js";

/** Checks a response mapping through Effect.
 * @param value - Candidate response.
 * @returns Whether the response is valid.
 * @example Effect.runSync(isHttpResponseMappingEffect(http.success(200)));
 */
export const isHttpResponseMappingEffect = Effect.fn("routes.validation.is-response")(
  (value: unknown) => routeTry("validation.is-response", () => isResponseValue(value)),
);

/** Checks a response mapping synchronously.
 * @param value - Candidate response.
 * @returns Whether the response is valid.
 * @example isHttpResponseMapping(http.success(200));
 */
export function isHttpResponseMapping(value: unknown): value is HttpResponseMapping {
  return runRouteSync(isHttpResponseMappingEffect(value));
}
function isResponseValue(value: unknown): value is HttpResponseMapping {
  return (
    isRecordValue(value) &&
    ownKeys(value, "kind", "id", "status", "errorId", "schema") &&
    isStableId(value.id) &&
    isStatusValue(value.status) &&
    ["success", "error", "validation-error", "response"].includes(String(value.kind)) &&
    (value.errorId === undefined || isStableId(value.errorId)) &&
    (value.schema === undefined || isSchemaValue(value.schema))
  );
}
/** Asserts a response mapping through Effect.
 * @param value - Candidate response.
 * @returns Valid response or tagged invalid-input failure.
 * @example Effect.runSync(assertResponseEffect(http.success(200)));
 */
export const assertResponseEffect = Effect.fn("routes.validation.assert-response")(
  (value: unknown) => routeTry("validation.assert-response", () => assertResponseValue(value)),
);

/** Asserts a response mapping synchronously.
 * @param value - Candidate response.
 * @returns Valid response.
 * @throws TypeError for invalid response mappings.
 * @example assertResponse(http.success(200));
 */
export function assertResponse(value: unknown): HttpResponseMapping {
  return runRouteSync(assertResponseEffect(value));
}

/** Validates a response inside an already observed operation.
 * @param value - Candidate response mapping.
 * @returns The valid response mapping.
 * @throws RouteInputError for an invalid response.
 * @example assertResponseValue({ kind: "success", id: "success.200", status: 200 });
 */
export function assertResponseValue(value: unknown): HttpResponseMapping {
  if (!isResponseValue(value)) throw new RouteInputError("Invalid HTTP response mapping");
  return value;
}

/** Checks a middleware response decision through Effect.
 * @param value - Candidate decision.
 * @returns Whether the decision is valid.
 * @example Effect.runSync(isMiddlewareDecisionEffect(http.continue()));
 */
export const isMiddlewareDecisionEffect = Effect.fn("routes.validation.is-decision")(
  (value: unknown) => routeTry("validation.is-decision", () => isDecisionValue(value)),
);

/** Checks a middleware response decision synchronously.
 * @param value - Candidate decision.
 * @returns Whether the decision is valid.
 * @example isMiddlewareDecision(http.continue());
 */
export function isMiddlewareDecision(value: unknown): value is MiddlewareDecisionMapping {
  return runRouteSync(isMiddlewareDecisionEffect(value));
}
function isDecisionValue(value: unknown): value is MiddlewareDecisionMapping {
  if (!isRecordValue(value)) return false;
  if (value.kind === "continue") return ownKeys(value, "kind");
  return (
    value.kind === "respond" &&
    ownKeys(value, "kind", "responseId", "body") &&
    isStableId(value.responseId) &&
    (value.body === undefined || isMappingValue(value.body))
  );
}
