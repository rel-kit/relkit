import { Cause, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import {
  createSupervisorObservabilityLayer,
  SupervisorObservabilityOwner,
} from "./observability-service.js";
import type { SupervisorTelemetry } from "./state-machine.types.js";
import type {
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability.types.js";

export type {
  SupervisorActivationFingerprint,
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability.types.js";

/**
 * Bridges lifecycle evidence to owned redacted native sinks.
 * @param options - Fingerprint authority, sinks, clock override and operation logging.
 * @returns Synchronous emission plus snapshot flush and optional awaitable owner cleanup.
 * @example
 * ```ts
 * import { createSupervisorObservability } from "@relkit/supervisor";
 * export async function observeGeneration(): Promise<void> {
 * const observer = createSupervisorObservability({
 *   activationFingerprint: { graphHash: "sha256:graph", manifestHash: "sha256:manifest",
 *     runtimeIntegrationsPlanHash: "sha256:integrations" },
 *   logger: { human: false, json: false },
 * });
 * try { await observer.flush(); }
 * finally { await observer.close?.(); }
 * }
 * ```
 */
export function createSupervisorObservability(
  options: SupervisorObservabilityOptions,
): SupervisorObservability {
  const owner = ManagedRuntime.make(
    Layer.mergeAll(
      createSupervisorObservabilityLayer(options),
      createLoggerLayer({ component: "supervisor", ...options.logger }),
      Layer.succeed(Metric.MetricRegistry, new Map()),
    ),
  );
  const service = runExecutionSync(owner, SupervisorObservabilityOwner);
  let closing: Promise<void> | undefined;
  /** Admits one complete redacted evidence batch. @param event - Lifecycle telemetry. @returns After synchronous admission. */
  const emit = (event: SupervisorTelemetry): void => {
    if (closing !== undefined) throw new Error("Supervisor observability is closed.");
    runExecutionSync(owner, service.emit(event));
  };
  /** Joins persistence admitted before this call. @returns Snapshot flush or existing close settlement. */
  const flush = (): Promise<void> => {
    if (closing !== undefined) return closing;
    return owner.runPromiseExit(service.flush).then((exit) => {
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    });
  };
  return Object.freeze({
    onTelemetry: emit,
    emit,
    flush,
    close: () => (closing ??= flush().finally(() => owner.dispose())),
  });
}
