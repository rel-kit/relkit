import type { MaybePromise, RequestId, TraceId } from "@relkit/contracts";
import { createTraceId, parseTraceParent, toRequestId, toTraceId } from "@relkit/contracts";
import type { Context } from "hono";
import type {
  HttpMiddlewareOptions,
  HttpRequestState,
  RequestLifecycleEvent,
  RequestLifecycleHooks,
  RequestLifecycleType,
} from "./middleware-utils.types.js";
export type {
  HttpMiddlewareOptions,
  HttpRequestState,
  RequestLifecycleEvent,
  RequestLifecycleHooks,
  RequestLifecycleType,
} from "./middleware-utils.types.js";

export const REQUEST_ID_HEADER = "x-request-id" as const;
export const TRACE_ID_HEADER = "x-trace-id" as const;
export const REQUEST_CONTEXT_KEY = "relkit.request" as const;

const terminalLifecycleStates = new WeakSet<HttpRequestState>();

/** Reads the framework-owned state attached to the Hono request.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @returns Valid framework request state, or undefined when no supported state is attached.
 */
export function getRequestState(context: Context): HttpRequestState | undefined {
  const value = (context as unknown as { get: (key: string) => unknown }).get(REQUEST_CONTEXT_KEY);
  return isRequestState(value) ? value : undefined;
}

/** Stores immutable request state for subsequent middleware and route handling.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param state - State owned by the current request or operation.
 * @returns Nothing; updates the framework state and public request-ID, trace-ID and signal bindings.
 */
export function setRequestState(context: Context, state: HttpRequestState): void {
  const target = context as unknown as { set: (key: string, value: unknown) => void };
  target.set(REQUEST_CONTEXT_KEY, state);
  target.set("requestId", state.requestId);
  target.set("traceId", state.traceId);
  target.set("signal", state.signal);
  if (state.runtimeSignal !== undefined) state.runtimeSignal.current = state.signal;
}

/** Sets a response header without replacing the response body.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param name - Declared field, header, stream or configuration key.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Nothing; replaces response headers while retaining the same body and status.
 */
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

/** Creates request state when no outer native boundary supplied one.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A frozen request state using the native signal and validated or generated identifiers.
 */
export function createFallbackState(
  context: Context,
  options: HttpMiddlewareOptions,
): HttpRequestState {
  return Object.freeze({
    requestId: readId(undefined, options.requestId, "request", toRequestId),
    traceId:
      parseTraceParent(context.req.header("traceparent"), context.req.header("tracestate"))
        ?.traceId ?? readId(undefined, options.traceId, "trace", toTraceId),
    signal: context.req.raw.signal,
    runtimeSignal: { current: context.req.raw.signal },
    startedAt: Date.now(),
  });
}

/** Accepts a valid incoming identifier or generates and normalizes a replacement.
 * @param incoming - Untrusted incoming identifier to validate before reuse.
 * @param generate - Optional application identifier generator.
 * @param prefix - Identifier kind used by the fallback generator.
 * @param normalize - Identifier normalizer enforcing the public identifier contract.
 * @typeParam T - Value type retained by this operation.
 * @returns A normalized identifier, falling back to a generated value when supplied input is invalid.
 */
export function readId<T extends RequestId | TraceId>(
  incoming: string | undefined,
  generate: (() => string) | undefined,
  prefix: string,
  normalize: (value: unknown) => T,
): T {
  /** Generate a trace ID or a UUID-based identifier for this identifier kind.
   * @returns Fresh fallback text passed through the same public normalizer.
   */
  const fallback = () =>
    prefix === "trace" ? createTraceId() : `${prefix}-${crypto.randomUUID()}`;
  try {
    return normalize(incoming ?? generate?.() ?? fallback());
  } catch {
    return normalize(fallback());
  }
}

/** Builds a lifecycle event from the current Hono request and trace state.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param state - State owned by the current request or operation.
 * @param type - Lifecycle event kind describing the current request boundary.
 * @param error - Failure metadata recorded or projected at this boundary.
 * @param status - HTTP status associated with the observed response or lifecycle event.
 * @returns An immutable event with request identifiers and terminal duration/status when applicable.
 */
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

/** Invokes lifecycle hooks without allowing observer failure to alter the request.
 * @param options - Application dependencies and configuration for this domain.
 * @param event - Event or record being projected into the target protocol.
 * @param hook - Optional lifecycle hook selected for this event.
 * @returns A Promise settling after advisory hooks run in order, with hook failures isolated.
 */
export async function emitLifecycle(
  options: HttpMiddlewareOptions,
  event: RequestLifecycleEvent,
  hook: keyof RequestLifecycleHooks,
): Promise<void> {
  await call(options.onLifecycleEvent, event);
  await call(options.lifecycle?.emit, event);
  await call(options.lifecycle?.[hook], event);
}

/** Emits a terminal lifecycle event once for the owning request state.
 * @param options - Application dependencies and configuration for this domain.
 * @param state - State owned by the current request or operation.
 * @param event - Event or record being projected into the target protocol.
 * @param hook - Optional lifecycle hook selected for this event.
 * @returns A Promise settling after the first terminal event; repeated terminal calls are ignored.
 */
export async function emitTerminalLifecycle(
  options: HttpMiddlewareOptions,
  state: HttpRequestState,
  event: RequestLifecycleEvent,
  hook: keyof RequestLifecycleHooks,
): Promise<void> {
  if (state.runtimeSignal?.terminalLifecycle === true || terminalLifecycleStates.has(state)) return;
  if (state.runtimeSignal !== undefined) state.runtimeSignal.terminalLifecycle = true;
  terminalLifecycleStates.add(state);
  await emitLifecycle(options, event, hook);
}

/** Rejects invalid configured body or timeout limits during setup.
 * @param value - Value inspected, validated or projected by this operation.
 * @param name - Declared field, header, stream or configuration key.
 * @returns Nothing for an absent or positive integer limit; invalid values throw TypeError.
 */
export function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    throw new TypeError(`${name} must be a positive integer`);
}

/** Invoke one optional advisory hook and isolate its rejection.
 * @param hook - Optional lifecycle hook selected for this event.
 * @param value - Value inspected, validated or projected by this operation.
 * @typeParam T - Value type retained by this operation.
 * @returns A Promise that succeeds after the optional advisory hook settles, including when it rejects.
 */
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

/** Projects a safe exception name for lifecycle telemetry.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The nonempty native error name, defaulting to Error for unsupported values.
 */
export function errorName(value: unknown): string {
  return value instanceof Error && value.name.length > 0 ? value.name : "Error";
}

/** Recognizes valid framework request state before using its identifiers and signal.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
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
