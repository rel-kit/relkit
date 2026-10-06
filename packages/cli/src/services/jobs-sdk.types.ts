import type { Effect, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Narrow native oRPC authority; domains own identifiers, payloads and retry policy. */
export interface JobsSdkOperations {
  /**
   * Submits one native job mutation exactly once.
   * @param baseUrl - Validated loopback backend URL.
   * @param headers - Backend-issued identity, cookies and protocol version.
   * @param job - Resolved public job name.
   * @param input - Existing procedure payload.
   * @param signal - Caller cancellation combined with this receipt's owner.
   * @returns Original result or native rejection after physical settlement.
   */
  readonly trigger: (
    baseUrl: string,
    headers: Readonly<Record<string, string>>,
    job: string,
    input: unknown,
    signal: AbortSignal,
  ) => Effect.Effect<unknown, CliAdapterError>;
  /**
   * Acquires one native watch iterator and owns its physical return.
   * @param baseUrl - Validated loopback backend URL.
   * @param headers - Backend-issued identity, cookies and protocol version.
   * @param job - Resolved public job name.
   * @param input - Existing watch locator and resume cursor.
   * @param signal - Caller cancellation combined with this receipt's owner.
   * @returns The original iterator in its caller's scope, with one release owner.
   */
  readonly watch: (
    baseUrl: string,
    headers: Readonly<Record<string, string>>,
    job: string,
    input: unknown,
    signal: AbortSignal,
  ) => Effect.Effect<AsyncIterator<unknown>, CliAdapterError, Scope.Scope>;
}
