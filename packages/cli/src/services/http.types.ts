import type { Effect, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Cancellable native HTTP authority; domains own protocol/status decisions. */
export interface HttpCapabilities {
  /**
   * Sends one HTTP request using the owning fiber's abort signal.
   * @param url - Already validated HTTP endpoint.
   * @param options - Native request policy excluding caller-owned signal overrides.
   * @returns A lazy response or typed request failure; mutations are never retried.
   */
  readonly request: (
    url: string | URL,
    options?: Omit<RequestInit, "signal">,
  ) => Effect.Effect<Response, CliAdapterError, Scope.Scope>;
  /**
   * Reads UTF-8 response text with a byte bound and scoped stream cancellation.
   * @param response - Response whose body this invocation owns.
   * @param maximumBytes - Maximum admitted raw bytes, before text decoding.
   * @returns Bounded text or a typed read/limit failure.
   */
  readonly text: (
    response: Response,
    maximumBytes: number,
  ) => Effect.Effect<string, CliAdapterError>;
  /**
   * Parses bounded response JSON without asserting a domain type.
   * @param response - Response whose body this invocation owns.
   * @param maximumBytes - Raw-byte admission bound.
   * @returns Untrusted decoded JSON for the domain's Schema boundary.
   */
  readonly json: (
    response: Response,
    maximumBytes: number,
  ) => Effect.Effect<unknown, CliAdapterError>;
}
