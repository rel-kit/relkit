/** Acquires compiler/telemetry support with shared logger policy and per-generation telemetry reconfiguration. */
import { admitObservabilityRecord } from "@relkit/observability";
import { Effect, Ref } from "effect";
import { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
import { createDevLogger, devLogSinks } from "./dev-logger.js";
import { CliDevCapture } from "./dev-capture.service.js";
import type { DevCapture } from "./dev-capture.types.js";
import { makeDevInspectionControl } from "./dev-inspection-control.js";
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
  const configured = yield* Ref.make<DevCapture | undefined>(undefined);
  const inspection = makeDevInspectionControl(configured, ports.inspector);
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
    configureInspector: (next, request) => inspection.prepare(next, request),
  });
  const log = createDevLogger({ compile: compiler.compile, logger, terminal });
  const telemetry = yield* CliDevCapture.use((capture) =>
    capture.acquire(ports.inspector !== false, Ref.getUnsafe(configuration)),
  );
  yield* Ref.set(configured, telemetry);
  return { compiler, logger, log, telemetry, inspection };
});
