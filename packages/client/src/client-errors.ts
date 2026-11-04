import type { RelkitUndeclaredErrorCode } from "./index.types.js";

/**
 * A request that ended without a response, such as a refused connection.
 * @example throw new RelkitNetworkError(new TypeError("fetch failed"));
 */
export class RelkitNetworkError extends Error {
  readonly code: RelkitUndeclaredErrorCode = "NETWORK_ERROR";
  readonly status = 0;
  readonly data = undefined;
  readonly defined = false as const;

  /**
   * Wraps the transport failure.
   * @param cause - The original failure.
   */
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "The request did not reach the backend.", {
      cause,
    });
    this.name = "RelkitNetworkError";
  }
}

/** Statuses of the undeclared codes, for transports such as WebSocket that carry no status. */
const commonStatus: Readonly<Record<string, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  NOT_ACCEPTABLE: 406,
  TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  IDENTITY_PRECONDITION_FAILED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_WINDOW_EXPIRED: 409,
  PROVIDER_STATE_LOST: 503,
};

/**
 * Gives every client failure a `code`, `status` and `data`, so callers can narrow on `code`.
 * Errors with a string code pass through, gaining the code's status when the transport
 * gave none; aborts pass through too, because the caller started them.
 * @param error - The failure from the transport.
 * @returns The same error, or a {@link RelkitNetworkError} wrapping it.
 * @example throw normalizeClientError(error);
 */
export function normalizeClientError(error: unknown): unknown {
  if (error !== null && typeof error === "object") {
    const record = error as {
      readonly code?: unknown;
      readonly status?: unknown;
      readonly name?: unknown;
    };
    if (typeof record.code === "string") {
      if (typeof record.status !== "number")
        Object.defineProperty(error, "status", {
          value: commonStatus[record.code] ?? 500,
          enumerable: true,
          configurable: true,
        });
      return error;
    }
    if (record.name === "AbortError" || record.name === "CancelledError") return error;
  }
  return new RelkitNetworkError(error);
}
