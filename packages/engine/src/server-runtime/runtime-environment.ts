/** Acquires generation cancellation, configured lifecycle budgets and the explicit failure sink. */
import { Config, Context, Effect, Layer } from "effect";
import type {
  RuntimeEnvironmentOperations,
  RuntimeEnvironmentOptions,
} from "./server-runtime.types.js";
import type { ServerRuntimeFailure } from "./server-runtime.schemas.js";
/** Shared environment authority; make owns the controller until the layer scope closes. */
export class RuntimeEnvironment extends Context.Service<
  RuntimeEnvironment,
  RuntimeEnvironmentOperations
>()("@relkit/cli/ServerRuntimeEnvironment", {
  make: Effect.fn("ServerRuntime.environment")(function* (options: RuntimeEnvironmentOptions) {
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (value) => Effect.sync(() => value.abort(new Error("Runtime is stopping."))),
    );
    const drain = yield* Config.String("RELKIT_DRAIN_TIMEOUT_MS").pipe(Config.withDefault("60000"));
    const telemetry = yield* Config.String("RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS").pipe(
      Config.withDefault("1000"),
    );
    const delay = yield* Config.String("RELKIT_PROVIDER_READY_DELAY_MS").pipe(
      Config.withDefault("0"),
    );
    const environment = yield* Config.String("RELKIT_ENV").pipe(Config.withDefault(""));
    const nodeEnvironment = yield* Config.String("NODE_ENV").pipe(Config.withDefault(""));
    return {
      controller,
      initialReady: {
        provider: false,
        database: true,
        auth: true,
        nativeWorker: true,
        server: false,
        ...options.ready,
      },
      drainTimeoutMs: runtimeDuration(drain, 60_000),
      telemetryTimeoutMs: runtimeDuration(telemetry, 1_000),
      providerDelayMs: runtimeDuration(delay, 0),
      workerIntervalMs:
        environment === "production" ||
        (!["development", "test", "production"].includes(environment) &&
          nodeEnvironment === "production")
          ? 1_000
          : 100,
      report: Effect.fn("ServerRuntime.report")((failure: ServerRuntimeFailure, cleanup: boolean) =>
        Effect.sync(() => options.report(failure, cleanup)),
      ),
    } satisfies RuntimeEnvironmentOperations;
  }),
}) {}
/** @param options - Generated boundary configuration and report sink. @returns A scoped environment layer using the service-owned make. */
export function runtimeEnvironmentLayer(options: RuntimeEnvironmentOptions) {
  return Layer.effect(RuntimeEnvironment, RuntimeEnvironment.make(options));
}
/**
 * Preserves the previous runtime timeout conversion and upper bound.
 * @param value - Configured text.
 * @param fallback - Default for invalid, negative, or non-integral values.
 * @returns A duration between zero and five minutes.
 */
export function runtimeDuration(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 300_000) : fallback;
}
