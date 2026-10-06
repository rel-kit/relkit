import type { Effect } from "effect";
import type { LocalWorkerEffects } from "@relkit/observability/local";
import type { ObservabilityStream } from "@relkit/observability";
import type { CliAdapterError } from "../cli-errors.js";

/** Explicit native telemetry infrastructure; the domain owns all acquired lifetimes. */
export interface TelemetryNativeOperations {
  /**
   * Starts one worker without opening a database.
   * @param onFailure - Native callback publishing failure before dependent work resumes.
   * @returns Native Effect worker authority; the telemetry scope owns close.
   */
  readonly worker: (
    onFailure: (error: Error) => void,
  ) => Effect.Effect<LocalWorkerEffects, CliAdapterError>;
  /**
   * Creates the existing bounded native stream consumed by the inspector SDK.
   * @returns Original native stream identity; its telemetry scope owns close.
   */
  readonly stream: () => Effect.Effect<ObservabilityStream, CliAdapterError>;
  /**
   * Acquires the existing authenticated loopback listener.
   * @param handler - Native HTTP ingress callback using one captured execution context.
   * @returns Actual URL and physical stop receipt, owned by telemetry scope.
   */
  readonly listen: (handler: (request: Request) => Promise<Response>) => Effect.Effect<
    {
      readonly url: string;
      readonly stop: Effect.Effect<void, CliAdapterError>;
    },
    CliAdapterError
  >;
  /**
   * Joins physical worker close, including the native child exit after close IPC.
   * @param worker - Exactly one acquired worker.
   * @returns Completion after the worker has physically exited, with a finite deadline.
   */
  readonly closeWorker: (worker: LocalWorkerEffects) => Effect.Effect<void, CliAdapterError>;
}
