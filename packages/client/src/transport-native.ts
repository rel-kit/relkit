import { RPCLink } from "@orpc/client/fetch";
import { RPCLink as WebSocketRPCLink } from "@orpc/client/websocket";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_QUERY, AGENT_CAPABILITY_VALUE } from "./wire.js";
import type {
  ClientHeaders,
  CreateClientOptions,
  CreateWebSocketClientOptions,
} from "./index.types.js";
import { connectSocket } from "./transport-socket.js";
import type { TransportContext, TransportLink } from "./transport.types.js";

/**
 * Builds the native HTTP oRPC link with lazy headers and owned iterator cancellation.
 * @param options - Existing public configuration and authority.
 * @returns The native HTTP link, with an owned cancellation interceptor.
 */
export function httpLink(options: CreateClientOptions): RPCLink<Record<PropertyKey, unknown>> {
  const endpoint = endpointFor(options.baseUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  return new RPCLink({
    url: endpoint.href,
    headers: () => resolveHeaders(options.headers),
    interceptors: [
      async (call) => {
        const controller = new AbortController();
        const signal =
          call.signal === undefined
            ? controller.signal
            : AbortSignal.any([call.signal, controller.signal]);
        const response: { status?: number } = {};
        responseStatus.set(signal, response);
        let output: unknown;
        try {
          output = await call.next({ ...call, signal });
        } catch (error) {
          throw withStatus(error, response.status);
        }
        if (
          output === null ||
          typeof output !== "object" ||
          !("next" in output) ||
          typeof output.next !== "function" ||
          !("return" in output) ||
          typeof output.return !== "function" ||
          !(Symbol.asyncIterator in output)
        )
          return output;
        const iterator = output as AsyncIterableIterator<unknown>;
        const wrapped: AsyncIterableIterator<unknown> = {
          next: (value?: unknown) => iterator.next(value),
          return: (value?: unknown) => {
            // Cancelling the decoder alone can leave the HTTP connection open.
            // Abort its owning request before waiting for an in-flight pull.
            controller.abort();
            return iterator.return?.(value) ?? Promise.resolve({ done: true, value });
          },
          throw: (error?: unknown) => {
            controller.abort();
            return iterator.throw?.(error) ?? Promise.reject(error);
          },
          [Symbol.asyncIterator]: () => wrapped,
        };
        return wrapped;
      },
    ],
    fetch: async (request, init, call) => {
      // oRPC 1.x hands over a Request; pass its parts as init so a caller's fetch wrapper
      // (tracing, tests) sees the headers, body and signal as it did before.
      const body =
        request.method === "GET" || request.method === "HEAD" ? undefined : await request.blob();
      const response = await fetcher(request.url, {
        ...init,
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        credentials: options.credentials ?? "include",
        ...(body === undefined ? {} : { body }),
      });
      const record = call.signal == null ? undefined : responseStatus.get(call.signal);
      if (record !== undefined) record.status = response.status;
      return response;
    },
  });
}

/** HTTP status of each call's response, keyed by the call's own signal. */
const responseStatus = new WeakMap<AbortSignal, { status?: number }>();

/**
 * Gives an error from an HTTP response the response's status, which oRPC errors omit.
 * @param error - The call's failure.
 * @param status - The response status, when a response arrived.
 * @returns The same error.
 */
function withStatus(error: unknown, status: number | undefined): unknown {
  if (
    status !== undefined &&
    error !== null &&
    typeof error === "object" &&
    typeof (error as { readonly code?: unknown }).code === "string" &&
    typeof (error as { readonly status?: unknown }).status !== "number"
  )
    Object.defineProperty(error, "status", { value: status, enumerable: true, configurable: true });
  return error;
}

/**
 * Builds the WebSocket link. oRPC 1.x binds a link to one socket, so this opens a socket
 * on first use and opens a new one for the next call after the socket closes.
 * @param options - Existing public configuration and authority.
 * @param Socket - Native WebSocket constructor.
 * @param connect - Lazy native socket establishment adapter.
 * @returns A link that reconnects after the socket closes.
 */
export function webSocketLink(
  options: CreateWebSocketClientOptions,
  Socket: typeof WebSocket,
  connect = () =>
    connectSocket(
      Socket,
      webSocketEndpoint(options.baseUrl),
      options.establishmentTimeoutMs ?? 10_000,
    ),
): TransportLink {
  let current: Promise<TransportLink> | undefined;
  const open = (): Promise<TransportLink> => {
    const next = connect().then((socket) => {
      socket.addEventListener("close", () => {
        if (current === next) current = undefined;
      });
      return new WebSocketRPCLink<TransportContext>({
        websocket: socket,
        headers: () => resolveHeaders(options.headers),
      });
    });
    current = next;
    next.catch(() => {
      if (current === next) current = undefined;
    });
    return next;
  };
  return {
    call: async (path, input, call) => (await (current ?? open())).call(path, input, call),
  };
}

/**
 * Resolves the RPC WebSocket endpoint and canonical agent capability query.
 * @param baseUrl - Configured backend root URL.
 * @returns The canonical WebSocket RPC URL.
 */
export function webSocketEndpoint(baseUrl: string): URL {
  const endpoint = endpointFor(baseUrl);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set(AGENT_CAPABILITY_QUERY, AGENT_CAPABILITY_VALUE);
  return endpoint;
}

/**
 * Resolves the RPC path relative to the caller's existing backend root.
 * @param baseUrl - Configured backend root URL.
 * @returns The RPC endpoint resolved against the backend root.
 */
function endpointFor(baseUrl: string): URL {
  const base = new URL(baseUrl);
  const root = base.pathname.endsWith("/") ? base : new URL(`${base.pathname}/`, base);
  return new URL("rpc", root);
}

/**
 * Resolves current header values without mutating caller-owned headers.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function resolveHeaders(value: ClientHeaders | undefined): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  const headers = resolved instanceof Headers ? new Headers(resolved) : new Headers();
  if (!(resolved instanceof Headers) && Array.isArray(resolved)) {
    for (const [name, entry] of resolved) headers.append(name, entry);
  } else if (!(resolved instanceof Headers)) {
    for (const [name, entry] of Object.entries(resolved ?? {})) headers.set(name, entry);
  }
  if (!headers.has(AGENT_CAPABILITY_HEADER)) {
    headers.set(AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE);
  }
  return headers;
}
