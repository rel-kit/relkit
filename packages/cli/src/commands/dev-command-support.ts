/** Acquires compiler/telemetry support with shared logger policy and per-generation telemetry reconfiguration. */
import { admitObservabilityRecord } from "@relkit/observability";
import { Effect, Ref } from "effect";
import { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
import { createDevLogger, devLogSinks } from "./dev-logger.js";
import { CliDevCapture } from "./dev-capture.service.js";
import type { DevCapture } from "./dev-capture.types.js";
import type { InspectorConfiguration } from "@relkit/contracts";
import { inspectorRestartNotice } from "./dev-inspector-policy.js";
import type { DevLog, DevOptions } from "./dev.types.js";
import type { DevCommandSessionState } from "./dev-command-session.types.js";

/** Command logger, attached after compiler acquisition, and the last reported inspector policy. */
interface InspectorNotices {
  readonly log?: DevLog | undefined;
  readonly reported?: string | undefined;
}

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
  const notices = yield* Ref.make<InspectorNotices>({});
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
    configureInspector: (next) => reportInspectorRestart(notices, ports.inspector, next),
  });
  const log = createDevLogger({ compile: compiler.compile, logger, terminal });
  yield* Ref.update(notices, (state) => ({ ...state, log }));
  const telemetry = yield* CliDevCapture.use((capture) =>
    capture.acquire(ports.inspector !== false, Ref.getUnsafe(configuration)),
  );
  yield* Ref.set(configured, telemetry);
  return { compiler, logger, log, telemetry };
});

/**
 * Warns once per changed inspector policy that the session-owned bridge needs a restart.
 * @param notices - Command logger and the last reported policy.
 * @param startup - Bridge policy captured at session startup.
 * @param next - Inspector settings from the accepted generation.
 * @returns Observation completion; reporting never rejects the generation.
 */
function reportInspectorRestart(
  notices: Ref.Ref<InspectorNotices>,
  startup: DevCommandSessionState["ports"]["inspector"],
  next: InspectorConfiguration,
) {
  return Ref.modify(notices, (state) => {
    const message = inspectorRestartNotice(startup, next);
    const key = message === undefined ? undefined : JSON.stringify(next);
    const report = key !== undefined && key !== state.reported ? message : undefined;
    return [[state.log, report] as const, { ...state, reported: key }];
  }).pipe(
    Effect.map(([log, message]) => {
      if (message !== undefined)
        log?.({ level: "warn", event: "dev.inspector.restart-required", fields: { message } });
    }),
  );
}
