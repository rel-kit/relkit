import type { Context } from "hono";
import { createRequestRecordBuilder, type RequestOutcome } from "@relkit/observability";
import {
  setRequestState,
  type HttpMiddlewareOptions,
  type HttpRequestState,
} from "./middleware-utils.js";

export function ensureRequestRecord(
  context: Context,
  state: HttpRequestState,
  options: HttpMiddlewareOptions,
): HttpRequestState {
  if (state.requestRecord !== undefined || options.observability === undefined) return state;
  const requestBytes = contentLength(context.req.raw);
  const requestRecord = createRequestRecordBuilder({
    requestId: state.requestId,
    traceId: state.traceId,
    generationId: options.generationId ?? "generation.unknown",
    graphHash: options.graphHash ?? "sha256:unknown",
    method: context.req.method,
    rawPath: new URL(context.req.url).pathname,
    startedAt: state.startedAt,
    ...(requestBytes === undefined ? {} : { requestBytes }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  options.observability.collect(requestRecord.started);
  requestRecord.add({ kind: "accepted", at: state.startedAt });
  const next = Object.freeze({ ...state, requestRecord });
  setRequestState(context, next);
  return next;
}

export function finishRequestRecord(
  context: Context,
  state: HttpRequestState,
  options: HttpMiddlewareOptions,
  outcome: RequestOutcome,
): import("@relkit/observability").RequestRecord | undefined {
  const builder = state.requestRecord;
  const sink = options.observability;
  if (builder === undefined || sink === undefined) return undefined;
  const responseStatus = context.res.status;
  const effectiveOutcome = builder.setOutcome(
    outcome === "success" && responseStatus >= 500 ? "defect" : outcome,
  );
  const status =
    responseStatus >= 400 ? responseStatus : fallbackStatus(effectiveOutcome, responseStatus);
  builder.add({ kind: "response", status, outcome: effectiveOutcome });
  const responseBytes = contentLength(context.res);
  const record = builder.finish({
    status,
    ...(responseBytes === undefined ? {} : { responseBytes }),
  });
  sink.collect(record);
  return record;
}

function contentLength(value: Request | Response): number | undefined {
  const header = value.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header))
    return value instanceof Response && value.status === 204 ? 0 : undefined;
  const bytes = Number(header);
  return Number.isSafeInteger(bytes) ? bytes : undefined;
}

function fallbackStatus(outcome: RequestOutcome, responseStatus: number): number {
  if (outcome === "success") return responseStatus || 200;
  if (outcome === "validation-error") return 422;
  if (outcome === "timeout") return 504;
  if (outcome === "cancelled") return 499;
  return 500;
}
