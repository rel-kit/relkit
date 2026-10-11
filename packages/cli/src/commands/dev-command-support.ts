/** Acquires compiler/telemetry support with shared logger policy and per-generation telemetry reconfiguration. */
import { admitObservabilityRecord } from "@relkit/observability";
import { Effect, Ref } from "effect";
import { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
import { createDevLogger, devLogSinks } from "./dev-logger.js";
import { makeDevTelemetryEffect } from "./dev-telemetry.js";
import type { DevOptions } from "./dev.types.js";
import type { DevCommandSessionState } from "./dev-command-session.types.js";

/**
 * Applies configured redaction and the command's native output sinks.
 * @param state - Current telemetry policy, terminal flags and command context.
 * @returns The logger shared by compiler, session and telemetry callbacks.
 */
function commandLogger(state: DevCommandSessionState): NonNullable<DevOptions["logger"]> {
  const { configuration, options, context } = state;
  return {
    redact: (record) => {
      const safe = admitObservabilityRecord(record, Ref.getUnsafe(configuration).redaction);
      return safe?.signal === "log" ? safe : record;
    },
    minimumLevel: options.logLevel ?? (options.verbose ? "debug" : "info"),
    ...devLogSinks(context.json, context.io?.stderr),
  };
}

/**
 * Acquires owned compilation and telemetry before creating the supervisor session.
 * @param state - Accepted initial evidence and command configuration.
 * @returns Shared compiler/logger/telemetry dependencies with typed acquisition failures.
 */
export const acquireDevCommandSupport = Effect.fn("Dev.commandSupport")(function* (
  state: DevCommandSessionState,
) {
  const { configuration, projectRoot, options, terminal, initial, ports } = state;
  const logger = commandLogger(state);
  const configured = yield* Ref.make<
    Effect.Success<ReturnType<typeof makeDevTelemetryEffect>> | undefined
  >(undefined);
  const compiler = yield* makeDevLocalCompilerEffect({
    projectRoot,
    initialCheck: initial.take,
    discardInitialCheck: initial.discard,
    localEnabled: options.local !== "off",
    color: terminal.color,
    backendPort: ports.backend,
    configureTelemetry: (next) =>
      Ref.set(configuration, next).pipe(
        Effect.andThen(
          Effect.suspend(() => Ref.getUnsafe(configured)?.configureEffect(next) ?? Effect.void),
        ),
      ),
  });
  const log = createDevLogger({ compile: compiler.compile, logger, terminal });
  const telemetry = yield* makeDevTelemetryEffect(
    projectRoot,
    Ref.getUnsafe(configuration),
    (error) =>
      log({
        level: "error",
        event: "dev.storage.failed",
        fields: { message: error.message },
      }),
  );
  yield* Ref.set(configured, telemetry);
  if (telemetry.imported.records || telemetry.imported.malformed)
    log({
      level: telemetry.imported.malformed ? "warn" : "info",
      event: "dev.storage.imported",
      fields: telemetry.imported,
    });
  return { compiler, logger, log, telemetry };
});
