import { createRequestRecordBuilder, type RequestOutcome } from "@relkit/observability";
import type { Context } from "hono";
import {
  setRequestState,
  type HttpMiddlewareOptions,
  type HttpRequestState,
} from "./middleware-utils.js";

/** Creates one request record when the outer boundary has not already supplied it.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param state - State owned by the current request or operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The original request state or a frozen replacement containing its new record builder.
 */
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

/** Admits the terminal request record once with the authoritative outcome.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param state - State owned by the current request or operation.
 * @param options - Application dependencies and configuration for this domain.
 * @param outcome - Terminal classification used for durable state and telemetry.
 * @returns The collected terminal record, or undefined when request recording is disabled.
 */
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

/** Reads a valid nonnegative content length without trusting malformed headers.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The valid byte length, zero for an unlabelled 204 response, or undefined.
 */
function contentLength(value: Request | Response): number | undefined {
  const header = value.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header))
    return value instanceof Response && value.status === 204 ? 0 : undefined;
  const bytes = Number(header);
  return Number.isSafeInteger(bytes) ? bytes : undefined;
}

/** Chooses a status consistent with the terminal outcome when no response status is available.
 * @param outcome - Terminal classification used for durable state and telemetry.
 * @param responseStatus - Materialized response status, when available.
 * @returns The existing success status or the status corresponding to the terminal failure.
 */
function fallbackStatus(outcome: RequestOutcome, responseStatus: number): number {
  if (outcome === "success") return responseStatus || 200;
  if (outcome === "validation-error") return 422;
  if (outcome === "timeout") return 504;
  if (outcome === "cancelled") return 499;
  return 500;
}
