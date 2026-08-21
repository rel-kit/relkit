import { canonicalJson } from "@zsys/contracts";
import {
  MAX_OBSERVABILITY_QUERY_LIMIT,
  ObservabilityQueryError,
  OBSERVABILITY_STREAM_EVENT_TYPES,
  ObservabilityStreamError,
  type ObservabilityQueryRequest,
  type ObservabilityStream,
  type ObservabilityStreamEvent,
  type ObservabilityStreamEventType,
  type ObservabilityStreamOverflow,
  type ObservabilityStreamSubscriptionOptions,
} from "@zsys/observability";

export function readObservabilityQuery(request: Request): ObservabilityQueryRequest {
  const params = new URL(request.url).searchParams;
  const value: Record<string, string | number> = {};
  for (const name of [
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

type StreamRequest = Omit<ObservabilityStreamSubscriptionOptions, "overflow" | "backpressure"> & {
  readonly overflow?: ObservabilityStreamOverflow;
  readonly backpressure?: ObservabilityStreamOverflow;
  readonly type?: ObservabilityStreamEventType;
};

function readStreamOptions(request: Request): StreamRequest {
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

export function streamResponse(
  stream: ObservabilityStream,
  request: Request,
  apiVersion: number,
): Response {
  const input = readStreamOptions(request);
  const type = input.type;
  const subscriptionOptions: ObservabilityStreamSubscriptionOptions = {
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.afterCursor === undefined ? {} : { afterCursor: input.afterCursor }),
    ...(input.queueSize === undefined ? {} : { queueSize: input.queueSize }),
    ...(input.overflow === undefined ? {} : { overflow: input.overflow }),
    ...(input.backpressure === undefined ? {} : { backpressure: input.backpressure }),
  };
  const subscription = stream.subscribe(subscriptionOptions);
  let closed = false;
  let connected = false;
  const encoder = new TextEncoder();
  const close = (): void => {
    if (closed) return;
    closed = true;
    subscription.close();
    request.signal.removeEventListener("abort", close);
  };
  request.signal.addEventListener("abort", close, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!connected) {
          connected = true;
          controller.enqueue(encoder.encode(": connected\n\n"));
          return;
        }
        while (!closed) {
          const result = await subscription.next();
          if (closed) return;
          if (result.done) {
            close();
            controller.close();
            return;
          }
          if (type !== undefined && result.value.type !== type) continue;
          controller.enqueue(encoder.encode(eventFrame(result.value)));
          return;
        }
      } catch {
        close();
        controller.close();
      }
    },
    cancel: close,
  });
  return new Response(body, {
    headers: {
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-zsys-api-version": String(apiVersion),
    },
  });
}

function eventFrame(event: ObservabilityStreamEvent): string {
  return `id: ${event.cursor}\nevent: ${event.type}\ndata: ${canonicalJson(event)}\n\n`;
}

function integer(value: string, name: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw queryError(`${name} is invalid`);
  return Number(value);
}

function queryError(message: string): ObservabilityQueryError {
  return new ObservabilityQueryError(
    "ZSYS_OBSERVABILITY_QUERY_INVALID",
    `Observability query ${message}`,
  );
}

function streamError(message: string): ObservabilityStreamError {
  return new ObservabilityStreamError("ZSYS_OBSERVABILITY_STREAM_INVALID", message);
}
