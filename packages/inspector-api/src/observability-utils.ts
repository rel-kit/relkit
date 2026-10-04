import type { StreamRequest } from "./observability-utils.types.js";
import {
  MAX_OBSERVABILITY_QUERY_LIMIT,
  ObservabilityQueryError,
  OBSERVABILITY_STREAM_EVENT_TYPES,
  ObservabilityStreamError,
  type ObservabilityQueryRequest,
  type ObservabilityStreamEventType,
  type ObservabilityStreamOverflow,
} from "@relkit/observability";

/**
 * Validates the supported bounded observation query parameters.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A native query request preserving existing invalid-filter errors.
 */
export function readObservabilityQuery(request: Request): ObservabilityQueryRequest {
  const params = new URL(request.url).searchParams;
  const value: Record<string, string | number> = {};
  for (const name of [
    "search",
    "source",
    "order",
    "from",
    "to",
    "severity",
    "routeId",
    "functionId",
    "outcome",
    "requestId",
    "traceId",
    "serviceId",
    "generationId",
    "graphHash",
  ]) {
    const item = params.get(name);
    if (item !== null) {
      if (item.length === 0) throw queryError(`${name} is invalid`);
      value[name] = item;
    }
  }
  const cursor = params.get("cursor");
  if (cursor !== null) value.cursor = String(integer(cursor, "cursor"));
  const limit = params.get("limit");
  if (limit !== null)
    value.limit = Math.min(integer(limit, "limit"), MAX_OBSERVABILITY_QUERY_LIMIT);
  const protocol = params.get("protocol");
  if (protocol !== null) value.protocol = protocol;
  const version = params.get("version");
  if (version !== null) value.version = integer(version, "version");
  return value as unknown as ObservabilityQueryRequest;
}

/**
 * Validates stream replay and event-type selectors before subscribing.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Native subscription options preserving existing cursor errors.
 */
export function readStreamOptions(request: Request): StreamRequest {
  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor");
  const afterCursor = params.get("afterCursor");
  const lastEventId = request.headers.get("last-event-id") || undefined;
  const effectiveCursor = cursor ?? lastEventId;
  if (cursor !== null && lastEventId !== undefined && cursor !== lastEventId)
    throw streamError("cursor and Last-Event-ID disagree");
  if (effectiveCursor !== undefined) integer(effectiveCursor, "cursor");
  if (afterCursor !== null) integer(afterCursor, "afterCursor");
  const type = params.get("type");
  if (type !== null && !(OBSERVABILITY_STREAM_EVENT_TYPES as readonly string[]).includes(type))
    throw streamError("stream event type is invalid");
  const overflow = params.get("overflow");
  const backpressure = params.get("backpressure");
  if (overflow !== null && backpressure !== null && overflow !== backpressure)
    throw streamError("overflow and backpressure disagree");
  const queueSize = params.get("queueSize");
  const result: {
    cursor?: string;
    afterCursor?: string;
    queueSize?: number;
    overflow?: ObservabilityStreamOverflow;
    backpressure?: ObservabilityStreamOverflow;
    type?: ObservabilityStreamEventType;
  } = {};
  if (effectiveCursor !== undefined) result.cursor = effectiveCursor;
  if (afterCursor !== null) result.afterCursor = afterCursor;
  if (queueSize !== null) result.queueSize = integer(queueSize, "queueSize");
  if (overflow !== null) result.overflow = overflow as ObservabilityStreamOverflow;
  if (backpressure !== null) result.backpressure = backpressure as ObservabilityStreamOverflow;
  if (type !== null) result.type = type as ObservabilityStreamEventType;
  return result;
}

export { streamResponse } from "./observability-stream.js";

/**
 * Validates a numeric request field against its declared range and default.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @returns A finite accepted integer or the existing parameter error.
 */
function integer(value: string, name: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw queryError(`${name} is invalid`);
  return Number(value);
}

/**
 * Creates the existing invalid observation-query failure.
 * @param message - Public diagnostic message, preserving the compatibility constructor.
 * @returns A public observation query error.
 */
function queryError(message: string): ObservabilityQueryError {
  return new ObservabilityQueryError(
    "RELKIT_OBSERVABILITY_QUERY_INVALID",
    `Observability query ${message}`,
  );
}

/**
 * Creates the existing invalid stream replay failure.
 * @param message - Public diagnostic message, preserving the compatibility constructor.
 * @returns A public observation stream error.
 */
function streamError(message: string): ObservabilityStreamError {
  return new ObservabilityStreamError("RELKIT_OBSERVABILITY_STREAM_INVALID", message);
}
