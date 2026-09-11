import { createORPCClient, DynamicLink, ORPCError, type ClientLink } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { RPCLink as WebSocketRPCLink } from "@orpc/client/websocket";
import type { RouterContract, RouterContractClient } from "@orpc/contract";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_QUERY,
  AGENT_CAPABILITY_VALUE,
} from "@relkit/contracts";

export { ORPCError };

export interface DefaultContractRegistry {}

export type DefaultContract = DefaultContractRegistry extends {
  readonly contract: infer Contract extends RouterContract;
}
  ? Contract
  : RouterContract;

export type ClientHeadersInit =
  Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];
export type ClientHeaders =
  ClientHeadersInit | (() => ClientHeadersInit | Promise<ClientHeadersInit>);

export interface CreateClientOptions {
  readonly baseUrl: string;
  readonly headers?: ClientHeaders;
  readonly credentials?: RequestInit["credentials"];
  readonly fetch?: typeof globalThis.fetch;
}

export interface CreateWebSocketClientOptions {
  readonly baseUrl: string;
  readonly establishmentTimeoutMs?: number;
  readonly websocket?: typeof WebSocket;
}

export interface CreateAutoClientOptions
  extends CreateClientOptions, CreateWebSocketClientOptions {}

/**
 * Creates a typed HTTP client for the generated application contract.
 *
 * @example
 * ```ts
 * import { createClient } from "@relkit/client"
 *
 * const client = createClient({ baseUrl: "http://127.0.0.1:3000" })
 * void client
 * ```
 * @category Client
 * @since 0.1.0
 */
export function createClient<Contract extends RouterContract = DefaultContract>(
  options: CreateClientOptions,
): RouterContractClient<Contract> {
  return createORPCClient(httpLink(options)) as RouterContractClient<Contract>;
}

export function createWebSocketClient<Contract extends RouterContract = DefaultContract>(
  options: CreateWebSocketClientOptions,
): RouterContractClient<Contract> {
  const Socket = options.websocket ?? globalThis.WebSocket;
  if (Socket === undefined) throw new Error("WebSocket is unavailable in this runtime.");
  return createORPCClient(webSocketLink(options, Socket)) as RouterContractClient<Contract>;
}

export function createAutoClient<Contract extends RouterContract = DefaultContract>(
  options: CreateAutoClientOptions,
): RouterContractClient<Contract> {
  const fallback = httpLink(options);
  let selected: Promise<ClientLink<Record<PropertyKey, unknown>>> | undefined;
  const link = new DynamicLink(() => {
    selected ??= selectAutoLink(options, fallback);
    return selected;
  });
  return createORPCClient(link) as RouterContractClient<Contract>;
}

async function selectAutoLink(
  options: CreateAutoClientOptions,
  fallback: ClientLink<Record<PropertyKey, unknown>>,
): Promise<ClientLink<Record<PropertyKey, unknown>>> {
  const Socket = options.websocket ?? globalThis.WebSocket;
  if (Socket === undefined) return fallback;
  const endpoint = webSocketEndpoint(options.baseUrl);
  try {
    let first: WebSocket | undefined = await connectSocket(
      Socket,
      endpoint,
      options.establishmentTimeoutMs ?? 10_000,
    );
    return webSocketLink(options, Socket, () => {
      if (first === undefined)
        return connectSocket(Socket, endpoint, options.establishmentTimeoutMs ?? 10_000);
      const socket = first;
      first = undefined;
      return Promise.resolve(socket);
    });
  } catch {
    return fallback;
  }
}

function httpLink(options: CreateClientOptions): RPCLink<Record<PropertyKey, unknown>> {
  const endpoint = endpointFor(options.baseUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  return new RPCLink({
    origin: endpoint.origin,
    url: endpoint.pathname as `/${string}`,
    headers: () => resolveHeaders(options.headers),
    fetch: (url, init) => fetcher(url, { ...init, credentials: options.credentials ?? "include" }),
  });
}

function webSocketLink(
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
    reconnect: { enabled: true, onClose: { enabled: true } },
  });
}

function webSocketEndpoint(baseUrl: string): URL {
  const endpoint = endpointFor(baseUrl);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set(AGENT_CAPABILITY_QUERY, AGENT_CAPABILITY_VALUE);
  return endpoint;
}

function connectSocket(
  Socket: typeof WebSocket,
  endpoint: URL,
  timeoutMs: number,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket(endpoint);
    const timer = setTimeout(() => {
      socket.close();
      reject(new DOMException("WebSocket establishment timed out.", "TimeoutError"));
    }, timeoutMs);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve(socket);
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Relkit WebSocket connection failed."));
      },
      { once: true },
    );
  });
}

function endpointFor(baseUrl: string): URL {
  const base = new URL(baseUrl);
  const root = base.pathname.endsWith("/") ? base : new URL(`${base.pathname}/`, base);
  return new URL("rpc", root);
}

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
