import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Finite port availability authority, with one owner per native probe. */
export interface PortProbeOperations {
  /**
   * Acquires and releases a native listener before reporting availability.
   * @param port - Requested port; zero preserves the existing no-probe behavior.
   * @param hostname - Interface to bind.
   * @param override - CLI flag named in occupied-port guidance.
   * @returns Lazy completion after the listener closes, or the original native failure.
   */
  readonly check: (
    port: number,
    hostname: string,
    override: "--port" | "--inspector-port",
  ) => Effect.Effect<void, CliAdapterError>;
}
