/**
 * Applies a function route's `response` option: the status, headers and cookies it computes from
 * the target function's output. The function itself is unchanged, so jobs and tools that call it
 * see only its output.
 */
import type { HttpTriggerRegistration } from "../graph/index.js";
import { applyRouteResponse } from "../routes/index.js";
import type { RuntimeManifest } from "./materialize-routes.types.js";
import { mapSuccessResponse, type ResponseMappingOptions } from "./response-mapping.js";
import { internalErrorResponse } from "./response-mapping-utils.js";

/**
 * Maps a successful value to its response, then applies the route's `response` option.
 * @param trigger - Route registration being answered.
 * @param value - The target function's validated output.
 * @param options - Response mapping options for this request.
 * @param manifest - Manifest holding the authored route descriptor.
 * @returns The success response with the route's status, headers and cookies.
 */
export async function routeSuccessResponse(
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions,
  manifest: RuntimeManifest,
): Promise<Response> {
  const response = await mapSuccessResponse(trigger, value, options);
  const routes = manifest.routes ?? {};
  const route =
    routes instanceof Map
      ? routes.get(trigger.id)
      : Object.hasOwn(routes, trigger.id)
        ? (routes as Readonly<Record<string, unknown>>)[trigger.id]
        : undefined;
  if (!isRecord(route) || typeof route.response !== "function" || response.status >= 300)
    return response;
  try {
    return applyRouteResponse(response, (route.response as (output: unknown) => unknown)(value));
  } catch {
    return internalErrorResponse(options.traceId);
  }
}

/** Whether a value is an object or function whose fields can be read. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
