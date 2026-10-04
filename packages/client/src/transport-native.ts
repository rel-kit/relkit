import { RPCLink } from "@orpc/client/fetch";
import { RPCLink as WebSocketRPCLink } from "@orpc/client/websocket";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_QUERY,
  AGENT_CAPABILITY_VALUE,
} from "@relkit/contracts";
import type {
  ClientHeaders,
  CreateClientOptions,
  CreateWebSocketClientOptions,
} from "./index.types.js";
import { connectSocket } from "./transport-socket.js";

/**
 * Builds the native HTTP oRPC link with lazy headers and owned iterator cancellation.
 * @param options - Existing public configuration and authority.
 * @returns The native HTTP link, with an owned cancellation interceptor.
 */
export function httpLink(options: CreateClientOptions): RPCLink<Record<PropertyKey, unknown>> {
  const endpoint = endpointFor(options.baseUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  return new RPCLink({
    origin: endpoint.origin,
    url: endpoint.pathname as `/${string}`,
    headers: () => resolveHeaders(options.headers),
    interceptors: [
      async (call) => {
        const controller = new AbortController();
        const signal =
          call.signal === undefined
            ? controller.signal
            : AbortSignal.any([call.signal, controller.signal]);
        const output = await call.next({ ...call, signal });
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
    fetch: (url, init) => fetcher(url, { ...init, credentials: options.credentials ?? "include" }),
  });
}

/**
 * Builds the native oRPC WebSocket link while retaining SDK reconnect ownership.
 * @param options - Existing public configuration and authority.
 * @param Socket - Native WebSocket constructor.
 * @param connect - Lazy native socket establishment adapter.
 * @returns The native WebSocket link that owns SDK connection and reconnect behavior.
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
): WebSocketRPCLink<Record<PropertyKey, unknown>> {
  return new WebSocketRPCLink({
    connect,
    headers: () => resolveHeaders(options.headers),
    reconnect: { enabled: true, onClose: { enabled: true } },
  });
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
async function resolveHeaders(value: ClientHeaders | undefined): Promise<Headers> {
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
