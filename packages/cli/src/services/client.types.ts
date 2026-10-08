import type { Effect, Option, Redacted } from "effect";
import type { CliAdapterError, CliFailureError } from "../cli-errors.js";
import type { ClientCheckResult, ClientPullResult } from "../commands/client.types.js";

/** Invocation-owned client authentication configuration; secrets are never log attributes. */
export interface ClientSettingsCapabilities {
  readonly token: Option.Option<Redacted.Redacted<string>>;
}

/** Pull/check workflows after argument parsing, requiring only captured narrow capabilities. */
export interface ClientCapabilities {
  /**
   * Downloads, validates, and writes the client contract once; no mutation retry occurs.
   * @param baseUrl - Validated HTTP base endpoint.
   * @param directory - Absolute generated-client destination.
   * @returns Lazy public pull details or a typed protocol/native failure.
   */
  readonly pull: (
    baseUrl: string,
    directory: string,
  ) => Effect.Effect<ClientPullResult, CliAdapterError | CliFailureError>;
  /**
   * Checks the local public fingerprint against a validated remote document.
   * @param baseUrl - Validated HTTP base endpoint.
   * @param directory - Absolute local contract destination.
   * @returns Lazy current-fingerprint details or a typed drift/native failure.
   */
  readonly check: (
    baseUrl: string,
    directory: string,
  ) => Effect.Effect<ClientCheckResult, CliAdapterError | CliFailureError>;
}
