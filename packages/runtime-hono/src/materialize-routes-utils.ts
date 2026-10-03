import type { HttpTriggerRegistration } from "@relkit/graph";
import { frameworkTrace } from "@relkit/invocation";
import { Effect, Context as EffectContext, Layer, Result } from "effect";
import type { Context } from "hono";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { HttpRouteRequest, RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState } from "./middleware.js";
import { nativeStreamResponse } from "./native-stream.js";
import { requestFromContext } from "./request-context.js";
import { decodeInferredInput } from "./request-inference.js";
import { isRequestMappingFailure, mapRequest } from "./request-mapping.js";
import { invokeWithRecord, mapInputWithRecord, recordDetail } from "./request-record-utils.js";
import {
  mapFailureResponse,
  mapInputValidationResponse,
  mapSuccessResponse,
  type ResponseMappingOptions,
} from "./response-mapping.js";

/** Builds the Hono request adapter over the route workflow service.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Hono handler delegating to HttpRoutes and stripping bodies from HEAD responses.
 */
export function createRouteHandler(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): (context: Context) => Promise<Response> {
  return async (context) =>
    stripHead(
      trigger,
      await runHttp(
        Effect.gen(function* () {
          const service = yield* HttpRoutes;
          return yield* service.handle(context, trigger, options);
        }).pipe(Effect.provide(HttpRoutesLive)),
      ),
    );
}

/** Map route input, invoke its target and construct the public HTTP response.
 * @param context - Hono request context carrying framework state and trace ownership.
 * @param trigger - Compiled route input, target and response declarations.
 * @param options - Engine, manifest schemas and request/response mapping configuration.
 * @returns A lazy effect yielding a scalar, streaming or sanitized failure response.
 */
const handleRoute = Effect.fn("HttpRoutes.handle")(function* (
  context: Context,
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
) {
  const state = getRequestState(context);
  const request = requestFromContext(context, trigger.config.path);
  const builder = state?.requestRecord;
  builder?.setRoute(trigger.id, trigger.targetFunctionId);
  builder?.setServiceId(trigger.serviceId);
  frameworkTrace.rename(`${context.req.method} ${trigger.config.path}`);
  frameworkTrace.setAttributes({
    "http.route": trigger.config.path,
    "relkit.route.id": trigger.id,
    "relkit.function.id": trigger.targetFunctionId,
    "code.function.name": trigger.targetFunctionId,
    ...(trigger.serviceId === undefined ? {} : { "relkit.service.id": trigger.serviceId }),
  });
  frameworkTrace.event("http.route.matched", { "http.route": trigger.config.path });
  recordDetail(builder, { kind: "match", targetId: trigger.id, outcome: "success" });
  const responseOptions = responseOptionsFor(options, state?.signal);

  const input = yield* httpBoundary("route.mapInput", () =>
    mapInputWithRecord(
      () => routeInput(request, trigger, trigger.targetFunctionId, options),
      builder,
      trigger.targetFunctionId,
    ),
  );
  if (isRequestMappingFailure(input)) {
    frameworkTrace.event("http.validation.failed");
    builder?.setOutcome("validation-error");
    return mapInputValidationResponse(trigger, input.issues, responseOptions);
  }
  frameworkTrace.event("http.validation.completed");
  const invoked = yield* Effect.result(
    Effect.gen(function* () {
      const value = yield* httpBoundary("route.invoke", () =>
        invokeWithRecord(
          options.engine,
          {
            functionId: trigger.targetFunctionId,
            input,
            source: "http",
            ...(state?.signal === undefined ? {} : { signal: state.signal }),
            ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
            ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
            ...(typeof trigger.config.timeoutMs !== "number"
              ? {}
              : { timeoutMs: trigger.config.timeoutMs }),
            ...(options.auth === undefined
              ? {}
              : { auth: options.auth.contextFor(context.req.raw) }),
          },
          builder,
          "function",
          trigger.targetFunctionId,
        ),
      );
      if (trigger.config.stream != null) {
        if (!isAsyncIterable(value))
          return yield* Effect.fail(
            new HttpBoundaryError({
              operation: "route.stream",
              cause: new TypeError("Native stream target returned no iterator."),
            }),
          );
        return yield* httpBoundary("route.stream", () =>
          nativeStreamResponse(value, trigger.config.stream!.format),
        );
      }
      return yield* httpBoundary("route.response", () =>
        mapSuccessResponse(trigger, value, responseOptions),
      );
    }),
  );
  return Result.isSuccess(invoked)
    ? invoked.success
    : yield* httpBoundary("route.failureResponse", () =>
        mapFailureResponse(trigger, invoked.failure.cause, responseOptions),
      );
});

/** Recognizes a value that supplies the asynchronous iterator protocol.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

/** Removes the body from a HEAD response while preserving status and headers.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param response - Native response whose status, headers and body lifetime are preserved.
 * @returns A bodyless HEAD response retaining headers/status, or the unchanged non-HEAD response.
 */
function stripHead(trigger: HttpTriggerRegistration, response: Response): Response {
  if (trigger.config.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Combines route response validation options with the active cancellation signal.
 * @param options - Application dependencies and configuration for this domain.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns Configured response validation options with manifest schemas and the request signal.
 */
function responseOptionsFor(
  options: RouteMaterializationOptions,
  signal: AbortSignal | undefined,
): ResponseMappingOptions {
  return {
    ...(options.responseMapping ?? {}),
    ...(options.manifest.responseSchemas === undefined
      ? {}
      : { responseSchemas: options.manifest.responseSchemas }),
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Selects custom request mapping or declarative mapping followed by schema inference.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param targetFunctionId - target function id supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The mapped target input or the public request-mapping failure envelope.
 */
export async function routeInput(
  request: HttpRouteRequest,
  trigger: HttpTriggerRegistration,
  targetFunctionId: string,
  options: RouteMaterializationOptions,
): Promise<unknown> {
  if (options.mapInput !== undefined)
    return options.mapInput(request, trigger, targetFunctionId, trigger.config.request);
  const result = await mapRequest(request, trigger.config.request, {
    ...(options.requestMapping ?? {}),
    ...(trigger.config.maxBodyBytes === undefined
      ? {}
      : { maxBodyBytes: trigger.config.maxBodyBytes }),
    transforms: options.manifest.requestTransforms,
  });
  return isRequestMappingFailure(result)
    ? result
    : decodeInferredInput(
        result.value,
        getEntry(options.manifest.routes ?? {}, trigger.id),
        getEntry(options.manifest.targets ?? {}, trigger.targetFunctionId),
      );
}

/** Looks up an own entry in either a readonly object or map.
 * @param entries - Readonly lookup table supplied as an object or map.
 * @param id - Stable declaration identifier used for lookup.
 * @typeParam T - Value type retained by this operation.
 * @returns The matching own record property or map entry, or undefined.
 */
export function getEntry<T>(
  entries: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
  id: string,
): T | undefined {
  if (entries instanceof Map) return entries.get(id);
  const record = entries as Readonly<Record<string, T>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}
/** Recognizes a non-null object before reading its named properties.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

/** Coordinates mapping, invocation and response construction inside the owning request. */
export class HttpRoutes extends EffectContext.Service<
  HttpRoutes,
  { readonly handle: typeof handleRoute }
>()("@relkit/runtime-hono/HttpRoutes") {}

/** Native route workflows; deterministic layers may substitute route handling in isolation. */
export const HttpRoutesLive = Layer.succeed(HttpRoutes, {
  handle: (...args) => observeHttp("route.handle", handleRoute(...args)),
});
