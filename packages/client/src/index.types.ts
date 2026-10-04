/** Native header inputs accepted without copying mutable Headers at construction. */
export type ClientHeadersInit =
  Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];

/** Static headers or a provider evaluated for each future request. */
export type ClientHeaders =
  ClientHeadersInit | (() => ClientHeadersInit | Promise<ClientHeadersInit>);

/** HTTP client configuration preserving browser credentials and caller transport overrides. */
export interface CreateClientOptions {
  /** Application HTTP origin and optional base path. */
  readonly baseUrl: string;
  /** Request-time headers, including asynchronous providers. */
  readonly headers?: ClientHeaders;
  /** Browser fetch credentials policy; the live adapter supplies the existing default. */
  readonly credentials?: RequestInit["credentials"];
  /** Borrowed fetch implementation used for all HTTP requests. */
  readonly fetch?: typeof globalThis.fetch;
}

/** WebSocket configuration whose establishment timeout leaves accepted streams independent. */
export interface CreateWebSocketClientOptions {
  /** Application origin converted to its corresponding WebSocket protocol. */
  readonly baseUrl: string;
  /** Maximum time allowed for initial connection establishment. */
  readonly establishmentTimeoutMs?: number;
  /** Headers retained with the existing WebSocket transport contract. */
  readonly headers?: ClientHeaders;
  /** Borrowed WebSocket constructor, or the browser implementation when omitted. */
  readonly websocket?: typeof WebSocket;
}

/** Combined transport options; fallback applies only to WebSocket establishment failure. */
export interface CreateAutoClientOptions
  extends CreateClientOptions, CreateWebSocketClientOptions {}
