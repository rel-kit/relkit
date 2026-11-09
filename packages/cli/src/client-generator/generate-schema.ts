import type { ClientRoute, ResponseContract } from "./generate-schema.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import {
  recordCalculation,
  schemaDocumentCalculation,
  schemaTypeCalculation,
} from "./generate-schema-render.js";
/** Walks object properties to find a nested schema; returns undefined when absent. */
function schemaAtCore(root: unknown, path: readonly string[]): Effect.Effect<unknown> {
  return Effect.gen(function* () {
    let current = yield* schemaDocumentCalculation(root);
    for (const key of path) {
      const properties = yield* recordCalculation(current?.properties);
      if (properties === undefined) return undefined;
      current = yield* schemaDocumentCalculation(properties[key]);
    }
    return current;
  });
}
/** Selects the success, validation, rate-limit, or declared-error response schema.
 * @param route - Resolved route and target function.
 * @param response - Declared HTTP response.
 * @returns An Effect yielding its schema, when present; it has no expected failure.
 * @example Effect.runSync(schemaCalculations.responseEffect(route, response));
 */
function responseSchemaCore(
  route: ClientRoute,
  response: ResponseContract,
): Effect.Effect<unknown> {
  return Effect.gen(function* () {
    if (response.kind === "success") return route.target.output;
    if (response.kind === "validation-error") return validationSchema;
    if (response.status === 429) return rateLimitSchema;
    if (response.kind !== "error") return undefined;
    const errors = Array.isArray(route.target.errors) ? route.target.errors : [];
    let declared: Record<string, unknown> | undefined;
    for (const entry of errors) {
      const candidate = yield* recordCalculation(entry);
      if (candidate?.id === (response.errorId ?? response.id)) {
        declared = candidate;
        break;
      }
    }
    const data = declared?.data;
    const http = yield* recordCalculation(declared?.http);
    const status = typeof http?.status === "number" ? http.status : undefined;
    const retry =
      declared?.retry === "never" || declared?.retry === "later" ? declared.retry : undefined;
    return {
      type: "object",
      required: [
        "kind",
        "outcome",
        "code",
        "message",
        "retry",
        ...(status === undefined ? [] : ["status"]),
        ...(response.schema === undefined && data === undefined ? [] : ["data"]),
      ],
      properties: {
        kind: { const: "application" },
        outcome: { const: "declared-error" },
        code: { const: response.errorId ?? response.id },
        message: { type: "string" },
        ...(response.schema === undefined && data === undefined
          ? {}
          : { data: response.schema ?? data }),
        status:
          status === undefined
            ? { type: "integer", minimum: 100, maximum: 599 }
            : { const: status },
        retry: retry === undefined ? { enum: ["never", "later"] } : { const: retry },
      },
    };
  });
}
const validationSchema = {
  type: "object",
  required: ["error", "issues"],
  properties: {
    error: { const: "validation" },
    issues: { type: "array", items: { type: "object" } },
  },
};
const rateLimitSchema = {
  type: "object",
  required: ["error", "retryAfterMs"],
  properties: {
    error: { const: "rate-limit" },
    retryAfterMs: { type: "integer" },
  },
};
const schemaTypeOperation = makeGeneratorOperation("schemaType", schemaTypeCalculation);
/** Renders a supported JSON Schema shape as a TypeScript type expression.
 * @param value - Schema value to render.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(schemaTypeEffect(value));
 */
export const schemaTypeEffect = schemaTypeOperation.effect;
/** Renders a JSON Schema type for synchronous compiler callers.
 * @param value - Schema value to render.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example schemaType(value);
 */
export const schemaType = schemaTypeOperation.run;
const schemaAtOperation = makeGeneratorOperation("schemaAt", schemaAtCore);
/** Finds a nested object property schema by its mapping path.
 * @param root - Root schema document.
 * @param path - Property or route path.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(schemaAtEffect(root, path));
 */
export const schemaAtEffect = schemaAtOperation.effect;
/** Finds a nested property schema for synchronous compiler callers.
 * @param root - Root schema document.
 * @param path - Property or route path.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example schemaAt(root, path);
 */
export const schemaAt = schemaAtOperation.run;
const responseSchemaOperation = makeGeneratorOperation("responseSchema", responseSchemaCore);
/** Builds the schema for a declared HTTP response, including error envelopes.
 * @param route - Resolved client route.
 * @param response - Response contract.
 * @returns An Effect with the rendered result and no expected typed failures.
 * @example Effect.runSync(responseSchemaEffect(route, response));
 */
export const responseSchemaEffect = responseSchemaOperation.effect;
/** Builds an HTTP response schema for synchronous compiler callers.
 * @param route - Resolved client route.
 * @param response - Response contract.
 * @returns The rendered result.
 * @throws If malformed trusted input causes a defect.
 * @example responseSchema(route, response);
 */
export const responseSchema = responseSchemaOperation.run;
/** Schema calculations shared by composed generator operations. @internal */
export const schemaCalculations = {
  type: schemaTypeOperation.run,
  typeEffect: schemaTypeCalculation,
  at: schemaAtOperation.run,
  atEffect: schemaAtCore,
  response: responseSchemaOperation.run,
  responseEffect: responseSchemaCore,
} as const;
