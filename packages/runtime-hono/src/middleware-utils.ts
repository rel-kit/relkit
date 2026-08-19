import type { MaybePromise, RequestId, TraceId } from "@zsys/contracts";
import { toRequestId, toTraceId } from "@zsys/contracts";
import type { RequestRecordBuilder, RequestRecordSink } from "@zsys/observability";
import type { Context } from "hono";

export const REQUEST_ID_HEADER = "x-request-id" as const;
export const TRACE_ID_HEADER = "x-trace-id" as const;
export const REQUEST_CONTEXT_KEY = "zsys.request" as const;

export interface HttpRequestState {
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly deadlineMs?: number;
  readonly requestRecord?: RequestRecordBuilder;
}

export type RequestLifecycleType =
  "request.started" | "request.completed" | "request.failed" | "request.cancelled";

export interface RequestLifecycleEvent {
  readonly type: RequestLifecycleType;
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly method: string;
  readonly path: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly status?: number;
  readonly errorName?: string;
}

export interface RequestLifecycleHooks {
  readonly emit?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onStart?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onComplete?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onError?: (event: RequestLifecycleEvent) => MaybePromise<void>;
  readonly onCancel?: (event: RequestLifecycleEvent) => MaybePromise<void>;
}

export interface HttpMiddlewareOptions {
  readonly requestIdHeader?: string;
  readonly traceIdHeader?: string;
  readonly requestId?: () => string;
  readonly traceId?: () => string;
  readonly maxBodyBytes?: number;
  readonly timeoutMs?: number;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly now?: () => number;
  readonly observability?: RequestRecordSink;
  readonly lifecycle?: RequestLifecycleHooks;
  readonly onLifecycleEvent?: (event: RequestLifecycleEvent) => MaybePromise<void>;
}

export function getRequestState(context: Context): HttpRequestState | undefined {
  const value = (context as unknown as { get: (key: string) => unknown }).get(REQUEST_CONTEXT_KEY);
  return isRequestState(value) ? value : undefined;
}

export function setRequestState(context: Context, state: HttpRequestState): void {
  const target = context as unknown as { set: (key: string, value: unknown) => void };
  target.set(REQUEST_CONTEXT_KEY, state);
  target.set("requestId", state.requestId);
  target.set("traceId", state.traceId);
  target.set("signal", state.signal);
}

export function setResponseHeader(context: Context, name: string, value: string): void {
  const response = context.res;
  const headers = new Headers(response.headers);
  headers.set(name, value);
  context.res = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createFallbackState(
  context: Context,
  options: HttpMiddlewareOptions,
): HttpRequestState {
  return Object.freeze({
    requestId: readId(
      context.req.header(options.requestIdHeader ?? REQUEST_ID_HEADER),
      options.requestId,
      "request",
      toRequestId,
    ),
    traceId: readId(
      context.req.header(options.traceIdHeader ?? TRACE_ID_HEADER),
      options.traceId,
      "trace",
      toTraceId,
    ),
    signal: context.req.raw.signal,
    startedAt: Date.now(),
  });
}

export function readId<T extends RequestId | TraceId>(
  incoming: string | undefined,
  generate: (() => string) | undefined,
  prefix: string,
  normalize: (value: unknown) => T,
): T {
  try {
    return normalize(incoming ?? generate?.() ?? `${prefix}-${crypto.randomUUID()}`);
  } catch {
    return normalize(`${prefix}-${crypto.randomUUID()}`);
  }
}

export function lifecycleEvent(
  context: Context,
  state: HttpRequestState,
  type: RequestLifecycleType,
  error?: unknown,
  status?: number,
): RequestLifecycleEvent {
  const now = Date.now();
  return Object.freeze({
    type,
    requestId: state.requestId,
    traceId: state.traceId,
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    startedAt: new Date(state.startedAt).toISOString(),
    ...(type === "request.started"
      ? {}
      : {
          completedAt: new Date(now).toISOString(),
          durationMs: Math.max(0, now - state.startedAt),
          status: status ?? context.res.status,
        }),
    ...(error === undefined ? {} : { errorName: errorName(error) }),
  });
}

export async function emitLifecycle(
  options: HttpMiddlewareOptions,
  event: RequestLifecycleEvent,
  hook: keyof RequestLifecycleHooks,
): Promise<void> {
  await call(options.onLifecycleEvent, event);
  await call(options.lifecycle?.emit, event);
  await call(options.lifecycle?.[hook], event);
}

export function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    throw new TypeError(`${name} must be a positive integer`);
}

async function call<T>(
  hook: ((value: T) => MaybePromise<void>) | undefined,
  value: T,
): Promise<void> {
  try {
    await hook?.(value);
  } catch {
    // Lifecycle observers are advisory and cannot alter the response.
  }
}

function errorName(value: unknown): string {
  return value instanceof Error && value.name.length > 0 ? value.name : "Error";
}

function isRequestState(value: unknown): value is HttpRequestState {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.traceId === "string" &&
    candidate.signal instanceof AbortSignal &&
    typeof candidate.startedAt === "number"
  );
}
