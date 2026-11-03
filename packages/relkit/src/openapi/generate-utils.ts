import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import { buildRequestEffect } from "./generate-request.js";
import { buildResponsesEffect } from "./generate-response.js";
import { operationTagsEffect } from "./generate-tags.js";
import type {
  FunctionNode,
  HttpGraphTrigger,
  OpenApiOperation,
  ServiceNode,
} from "./generate-utils.types.js";

/** Project one HTTP trigger and its target into an OpenAPI operation.
 * @param trigger - HTTP route trigger.
 * @param target - Optional target function for raw handlers.
 * @param routePath - Expanded route path.
 * @param operationId - Stable ID, including a catch-all suffix when needed.
 * @param service - Optional owning service.
 * @returns Effect containing the operation; no expected failure.
 * @example Effect.runSync(buildOperationEffect(trigger, target));
 */
export const buildOperationEffect = Effect.fn("OpenApi.buildOperation")(
  (
    trigger: HttpGraphTrigger,
    target: FunctionNode | undefined,
    routePath = trigger.config.path,
    operationId = trigger.id,
    service?: ServiceNode,
  ): Effect.Effect<OpenApiOperation> =>
    observeOpenApi(
      "operation",
      Effect.gen(function* () {
        const request = yield* buildRequestEffect(
          trigger.config.request,
          target?.input ?? null,
          routePath,
        );
        const tags = yield* operationTagsEffect(service, trigger.config.tags);
        return {
          operationId,
          ...(trigger.config.title === undefined ? {} : { summary: trigger.config.title }),
          ...(trigger.config.description === undefined
            ? {}
            : { description: trigger.config.description }),
          ...(tags.length === 0 ? {} : { tags }),
          ...(request.parameters.length === 0 ? {} : { parameters: request.parameters }),
          ...(request.body === undefined ? {} : { requestBody: request.body }),
          responses:
            target === undefined
              ? { default: { description: "Response returned by the route handler" } }
              : yield* buildResponsesEffect(trigger.config.responses, target),
          "x-relkit": {
            routeId: trigger.id,
            ...(target === undefined ? {} : { functionId: target.id }),
            ...(service === undefined ? {} : { serviceId: service.id }),
            middleware: trigger.config.middleware.map((entry) => ({ ...entry })),
            transforms: trigger.config.transforms.map((entry) => entry.id),
            ...(trigger.config.rateLimit === undefined
              ? {}
              : { rateLimit: trigger.config.rateLimit }),
          },
        };
      }),
    ),
);

/** Convert authored parameter syntax to OpenAPI path templates.
 * @param value - Authored route path.
 * @returns Effect containing normalized OpenAPI path; no expected failure.
 * @example Effect.runSync(openApiPathEffect("/orders/:id"));
 */
export const openApiPathEffect = Effect.fn("OpenApi.path")((value: string) =>
  observeOpenApi(
    "path",
    Effect.sync(
      () =>
        value
          .split("/")
          .map((segment, index) => {
            if (segment.startsWith(":")) return `{${parameterName(segment.slice(1), index)}}`;
            if (segment.startsWith("*"))
              return `{${parameterName(segment.slice(1), index, "wildcard")}}`;
            return segment;
          })
          .join("/") || "/",
    ),
  ),
);

/** Sanitize a route segment name with a stable positional fallback. */
function parameterName(value: string, index: number, fallback = "param"): string {
  const result = value.replace(/[^A-Za-z0-9_.-]/g, "_");
  return result || `${fallback}${index}`;
}
