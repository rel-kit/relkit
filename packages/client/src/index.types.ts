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

/**
 * Generated finite route declaration preserving payload and failure inference.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Failure - The route's error union, keyed by `code`.
 */
export interface ClientRouteContract<
  Input = unknown,
  Output = unknown,
  Failure = RelkitClientError,
> {
  readonly input: Input;
  readonly output: Output;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: false;
}

/**
 * Generated route stream declaration preserving item and failure inference.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Item - Declared native stream item payload.
 * @typeParam Failure - The route's error union, keyed by `code`.
 */
export interface ClientStreamContract<
  Input = unknown,
  Item = unknown,
  Failure = RelkitClientError,
> {
  readonly input: Input;
  readonly output: AsyncIterable<Item>;
  readonly item: Item;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: true;
}

/**
 * An error a route declares, as the client receives it.
 * @typeParam Code - The declared error ID.
 * @typeParam Status - The HTTP status the error maps to.
 * @typeParam Data - The error's declared data.
 * @example if (error.code === "orders.not-found") console.log(error.data.orderId);
 */
export interface RelkitDeclaredError<
  Code extends string,
  Status extends number,
  Data,
> extends Error {
  readonly code: Code;
  readonly status: Status;
  readonly data: Data;
  readonly defined: true;
}

/** Codes of errors that no route declares: transport, framework and network failures. */
export type RelkitUndeclaredErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "PAYMENT_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_SUPPORTED"
  | "NOT_ACCEPTABLE"
  | "TIMEOUT"
  | "CONFLICT"
  | "GONE"
  | "PRECONDITION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNPROCESSABLE_CONTENT"
  | "PRECONDITION_REQUIRED"
  | "TOO_MANY_REQUESTS"
  | "CLIENT_CLOSED_REQUEST"
  | "INTERNAL_SERVER_ERROR"
  | "NOT_IMPLEMENTED"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE"
  | "GATEWAY_TIMEOUT"
  | "IDENTITY_PRECONDITION_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_WINDOW_EXPIRED"
  | "PROVIDER_STATE_LOST"
  | "NETWORK_ERROR";

/** An error that no route declares. `NETWORK_ERROR` means no response arrived. */
export interface RelkitUndeclaredError extends Error {
  readonly code: RelkitUndeclaredErrorCode;
  readonly status: number;
  readonly data: unknown;
  readonly defined: false;
}

/** Any client error: declared by a route or not. */
export type RelkitClientError =
  RelkitDeclaredError<string, number, unknown> | RelkitUndeclaredError;
