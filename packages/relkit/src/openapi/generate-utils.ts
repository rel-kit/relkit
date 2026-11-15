import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import { runtimeProblems } from "./generate-problem.js";
import { buildRequestEffect } from "./generate-request.js";
import { buildResponsesEffect } from "./generate-response.js";
import { operationSecurity } from "./generate-security.js";
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
        const protection = operationSecurity(trigger, target);
        const sent =
          target === undefined
            ? {}
            : runtimeProblems({
                body: request.body !== undefined,
                input:
                  request.parameters.length > 0 || request.body !== undefined || hasInput(target),
                rateLimited: trigger.config.rateLimit !== undefined,
              });
        return {
          operationId,
          ...(trigger.config.title === undefined ? {} : { summary: trigger.config.title }),
          ...(trigger.config.description === undefined
            ? {}
            : { description: trigger.config.description }),
          ...(tags.length === 0 ? {} : { tags }),
          ...(request.parameters.length === 0 ? {} : { parameters: request.parameters }),
          ...(request.body === undefined ? {} : { requestBody: request.body }),
          ...(protection.security === undefined ? {} : { security: protection.security }),
          responses: {
            ...protection.responses,
            ...sent,
            ...(target === undefined
              ? { default: { description: "Response returned by the route handler" } }
              : yield* buildResponsesEffect(trigger.config.responses, target)),
          },
          "x-relkit": {
            routeId: trigger.id,
            ...protection.relkit,
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

/** Whether a function's input schema describes any field a request could get wrong. */
function hasInput(target: FunctionNode): boolean {
  const input = target.input;
  if (!isObject(input)) return false;
  const schema = input.$relkit === "schema" ? input.jsonSchema : input;
  if (!isObject(schema)) return false;
  const { properties, required } = schema;
  return (
    (isObject(properties) && Object.keys(properties).length > 0) ||
    (Array.isArray(required) && required.length > 0)
  );
}

/** Narrow a value to a non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
