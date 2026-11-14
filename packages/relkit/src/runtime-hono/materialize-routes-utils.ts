import type { HttpTriggerRegistration } from "../graph/index.js";
import { frameworkTrace } from "../invocation/index.js";
import { Effect, Context as EffectContext, Layer, Result } from "effect";
import type { Context } from "hono";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { HttpRouteRequest, RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState, type HttpRequestState } from "./middleware.js";
import { nativeStreamResponse } from "./native-stream.js";
import { requestFromContext } from "./request-context.js";
import { isRequestMappingFailure } from "./request-mapping.js";
import {
  failureOutcome,
  invokeWithRecord,
  mapInputWithRecord,
  recordDetail,
} from "./request-record-utils.js";
import {
  mapFailureResponse,
  mapInputValidationResponse,
  type ResponseMappingOptions,
} from "./response-mapping.js";
import { getEntry, routeAccessFailure, routeInput } from "./route-input.js";
import { routeSuccessResponse } from "./route-response.js";
export { getEntry, isRecord, routeInput } from "./route-input.js";

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

/** Names the matched route on the request record and trace, for function and raw routes alike.
 * @param context - Hono request context carrying framework state and trace ownership.
 * @param trigger - Matched route declaration; a raw route is its own target.
 * @returns The request's record builder, when the request is being recorded.
 */
export function announceRoute(context: Context, trigger: HttpTriggerRegistration) {
  const builder = getRequestState(context)?.requestRecord;
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
  return builder;
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
  const builder = announceRoute(context, trigger);
  const responseOptions = responseOptionsFor(options, state);
  const target =
    options.resolveTarget === undefined
      ? getEntry(options.manifest.targets ?? {}, trigger.targetFunctionId)
      : yield* httpBoundary("route.resolveTarget", () =>
          Promise.resolve(options.resolveTarget!(trigger.targetFunctionId)),
        );
  // Who may call is decided before the request's input is read or reported.
  const denied = yield* routeAccessFailure(context, target, options);
  if (denied !== undefined) {
    const recorded = failureOutcome(denied);
    builder?.setOutcome(recorded.outcome, recorded.errorId);
    return yield* httpBoundary("route.failureResponse", () =>
      mapFailureResponse(trigger, denied, responseOptions),
    );
  }
  const input = yield* httpBoundary("route.mapInput", () =>
    mapInputWithRecord(
      () => routeInput(request, trigger, trigger.targetFunctionId, options, target),
      builder,
      trigger.targetFunctionId,
    ),
  );
  if (isRequestMappingFailure(input)) {
    // The validation response records the issues' codes and paths on `http.validation.failed`.
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
            ...(target === undefined ? {} : { target }),
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
        routeSuccessResponse(trigger, value, responseOptions, options.manifest),
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

/** Combines route response validation options with the request's signal and trace ID.
 * @param options - Application dependencies and configuration for this domain.
 * @param state - Request state supplying the cancellation signal and trace ID.
 * @returns Configured response options with manifest schemas, the signal and the trace ID.
 */
function responseOptionsFor(
  options: RouteMaterializationOptions,
  state: HttpRequestState | undefined,
): ResponseMappingOptions {
  return {
    ...(options.responseMapping ?? {}),
    ...(options.manifest.responseSchemas === undefined
      ? {}
      : { responseSchemas: options.manifest.responseSchemas }),
    ...(state === undefined ? {} : { signal: state.signal, traceId: state.traceId }),
  };
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
