import type { Context } from "hono";
import type { HttpTriggerRegistration } from "@zsys/graph";
import { mapRequest } from "./request-mapping.js";
import { isRequestMappingFailure } from "./request-mapping.js";
import type { HttpRouteRequest, RouteMaterializationOptions } from "./materialize-routes.js";
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
  return async (context) => stripHead(trigger, await handleRoute(context, trigger, options));
}

async function handleRoute(
  context: Context,
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): Promise<Response> {
  const state = getRequestState(context);
  const request = requestFromContext(context, trigger.config.path);
  const builder = state?.requestRecord;
  builder?.setRoute(trigger.id, trigger.targetFunctionId);
  builder?.setServiceId(trigger.serviceId);
  recordDetail(builder, { kind: "match", targetId: trigger.id, outcome: "success" });
  const responseOptions = responseOptionsFor(options, state?.signal);

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
}

function stripHead(trigger: HttpTriggerRegistration, response: Response): Response {
  if (trigger.config.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
  return isRequestMappingFailure(result) ? result : result.value;
}

export function getEntry<T>(
  entries: Readonly<Record<string, T>> | ReadonlyMap<string, T>,
  id: string,
): T | undefined {
  if (entries instanceof Map) return entries.get(id);
  const record = entries as Readonly<Record<string, T>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
