import { Config, Context, Effect, Layer } from "effect";
import type {
  RuntimeEnvironmentOperations,
  RuntimeEnvironmentOptions,
} from "./server-runtime.types.js";

/** Explicit signal, configuration, and failure sink supplied by the server boundary. */
export class RuntimeEnvironment extends Context.Service<
  RuntimeEnvironment,
  RuntimeEnvironmentOperations
>()("@relkit/cli/ServerRuntimeEnvironment") {}

/**
 * Acquires a generation's controller and compatible environment configuration.
 * @param options - Initial readiness and the existing structured runtime failure sink.
 * @returns A layer owning one AbortController and parsed lifecycle durations.
 * @remarks Config strings deliberately retain the existing invalid-value fallback.
 */
export function runtimeEnvironmentLayer(options: RuntimeEnvironmentOptions) {
  return Layer.effect(
    RuntimeEnvironment,
    Effect.gen(function* () {
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (value) => Effect.sync(() => value.abort(new Error("Runtime is stopping."))),
      );
      const drain = yield* Config.String("RELKIT_DRAIN_TIMEOUT_MS").pipe(
        Config.withDefault("60000"),
      );
      const telemetry = yield* Config.String("RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS").pipe(
        Config.withDefault("1000"),
      );
      const delay = yield* Config.String("RELKIT_PROVIDER_READY_DELAY_MS").pipe(
        Config.withDefault("0"),
      );
      const environment = yield* Config.String("RELKIT_ENV").pipe(Config.withDefault(""));
      const nodeEnvironment = yield* Config.String("NODE_ENV").pipe(Config.withDefault(""));
      return RuntimeEnvironment.of({
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
        report: Effect.fn("ServerRuntime.report")((failure, cleanup) =>
          Effect.sync(() => options.report(failure, cleanup)),
        ),
      });
    }),
  );
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
