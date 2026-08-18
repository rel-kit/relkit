import type { Context } from "hono";
import type { HttpTriggerRegistration } from "@zsys/graph";
import { mapRequest } from "./request-mapping.js";
import { isRequestMappingFailure } from "./request-mapping.js";
import type { HttpRouteRequest, RouteMaterializationOptions } from "./materialize-routes.js";
import type { RequestMappingFailure } from "./request-mapping.js";
import {
  mapFailureResponse,
  mapInputValidationResponse,
  mapSuccessResponse,
  type ResponseMappingOptions,
} from "./response-mapping.js";
import { getRequestState } from "./middleware.js";
import { invokeWithRecord, mapInputWithRecord, recordDetail } from "./request-record-utils.js";
import { requestFromContext } from "./request-context.js";

export function createRouteHandler(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): (context: Context) => Promise<Response> {
  return async (context) => {
    const request = requestFromContext(context);
    const state = getRequestState(context);
    const builder = state?.requestRecord;
    builder?.setRoute(trigger.id, trigger.targetFunctionId);
    recordDetail(builder, { kind: "match", targetId: trigger.id, outcome: "success" });
    const responseOptions = responseOptionsFor(options, state?.signal);

    for (const middleware of trigger.config.middleware) {
      const entry = getEntry(options.manifest.middleware, middleware.id);
      const input = await mapInputWithRecord(
        () => routeInput(request, trigger, middleware.targetFunctionId, options, middleware.id),
        builder,
        middleware.id,
      );
      if (isRequestMappingFailure(input)) {
        builder?.setOutcome("validation-error");
        return mapInputValidationResponse(trigger, input.issues, responseOptions);
      }
      let value: unknown;
      try {
        value = await invokeWithRecord(
          options.engine,
          {
            functionId: middleware.targetFunctionId,
            input,
            source: "http",
            ...(state?.signal === undefined ? {} : { signal: state.signal }),
            ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
            ...(state?.requestId === undefined ? {} : { correlationId: state.requestId }),
            ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
            ...(typeof trigger.config.timeoutMs !== "number"
              ? {}
              : { timeoutMs: trigger.config.timeoutMs }),
          },
          builder,
          "middleware",
          middleware.targetFunctionId,
        );
      } catch (cause) {
        return mapFailureResponse(trigger, cause, responseOptions);
      }
      const responseId = middlewareDecisionId(entry);
      if (middlewareDecision(entry) === "respond")
        return mapSuccessResponse(
          trigger,
          value,
          responseId === undefined ? responseOptions : { ...responseOptions, responseId },
        );
    }

    const input = await mapInputWithRecord(
      () => routeInput(request, trigger, trigger.targetFunctionId, options),
      builder,
      trigger.targetFunctionId,
    );
    if (isRequestMappingFailure(input)) {
      builder?.setOutcome("validation-error");
      return mapInputValidationResponse(trigger, input.issues, responseOptions);
    }
    try {
      const value = await invokeWithRecord(
        options.engine,
        {
          functionId: trigger.targetFunctionId,
          input,
          source: "http",
          ...(state?.signal === undefined ? {} : { signal: state.signal }),
          ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
          ...(state?.requestId === undefined ? {} : { correlationId: state.requestId }),
          ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
          ...(typeof trigger.config.timeoutMs !== "number"
            ? {}
            : { timeoutMs: trigger.config.timeoutMs }),
        },
        builder,
        "function",
        trigger.targetFunctionId,
      );
      return mapSuccessResponse(trigger, value, responseOptions);
    } catch (cause) {
      return mapFailureResponse(trigger, cause, responseOptions);
    }
  };
}

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

export async function routeInput(
  request: HttpRouteRequest,
  trigger: HttpTriggerRegistration,
  targetFunctionId: string,
  options: RouteMaterializationOptions,
  middlewareId?: string,
): Promise<unknown> {
  const entry =
    middlewareId === undefined ? undefined : getEntry(options.manifest.middleware, middlewareId);
  const mapping =
    isRecord(entry) && Object.prototype.hasOwnProperty.call(entry, "request")
      ? entry.request
      : trigger.config.request;
  if (options.mapInput !== undefined)
    return options.mapInput(request, trigger, targetFunctionId, mapping);
  const result = await mapRequest(request, mapping, {
    ...(options.requestMapping ?? {}),
    transforms: options.manifest.requestTransforms,
  });
  return isRequestMappingFailure(result) ? result : result.value;
}

export function validationResponse(
  trigger: HttpTriggerRegistration,
  failure: RequestMappingFailure,
): Response {
  const status = Array.isArray(trigger.config.responses)
    ? trigger.config.responses.find(
        (response) => isRecord(response) && response.kind === "validation-error",
      )
    : undefined;
  const code = isRecord(status) && typeof status.status === "number" ? status.status : 422;
  return new Response(JSON.stringify({ error: "validation", issues: failure.issues }), {
    status: code,
    headers: { "content-type": "application/json" },
  });
}

export function toResponse(value: unknown): Response {
  if (value instanceof Response) return value;
  if (value === undefined) return new Response(null, { status: 204 });
  if (typeof value === "string") return new Response(value);
  return new Response(JSON.stringify(value) ?? "null", {
    headers: { "content-type": "application/json" },
  });
}

export function getEntry<T>(
  entries: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
  id: string,
): T | undefined {
  if (entries instanceof Map) return entries.get(id);
  const record = entries as Readonly<Record<string, T>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}
export function middlewareTarget(value: unknown): string | undefined {
  return isRecord(value) && typeof value.targetFunctionId === "string"
    ? value.targetFunctionId
    : undefined;
}
export function middlewareDecision(value: unknown): "respond" | "continue" {
  const decision = isRecord(value) && isRecord(value.decision) ? value.decision : undefined;
  return decision?.kind === "respond" ? "respond" : "continue";
}
export function middlewareDecisionId(value: unknown): string | undefined {
  const decision = isRecord(value) && isRecord(value.decision) ? value.decision : undefined;
  return typeof decision?.responseId === "string" ? decision.responseId : undefined;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
