/** Owns the ordinary dev session, generated staging directory and native hangup listener after initial validation. */
import { Effect } from "effect";
import { join } from "node:path";
import { cliTry } from "../cli-errors.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { acquireDevSessionEffect } from "./dev.js";
import { acquireDevCommandSupport } from "./dev-command-support.js";
import type { DevSession } from "./dev-session.js";
import type { DevCommandSessionState, DevCommandSupport } from "./dev-command-session.types.js";

/**
 * Runs support and session work within the command's session lifetime.
 * @param state - Accepted initial compiler result and native command policy.
 * @returns Shutdown completion after support, compiler and session cleanup joins.
 */
export const runDevCommandSession = Effect.fn("Dev.runCommandSession")(
  (state: DevCommandSessionState) =>
    Effect.scoped(
      Effect.gen(function* () {
        const support = yield* acquireDevCommandSupport(state);
        const session = yield* acquireCommandSession(state, support);
        yield* installCommandHangup(session);
        yield* session.nativeEngine.watch;
        yield* session.nativeEngine.wait;
      }),
    ),
);

/**
 * Stages the generated directory and installs the established supervisor callbacks.
 * @param state - Command ports, cancellation and terminal policy.
 * @param support - Compiler and telemetry already acquired in the same Scope.
 * @returns Session whose native engine retains last-known-good traffic on rebuild failure.
 */
const acquireCommandSession = Effect.fn("Dev.acquireCommandSession")(function* (
  state: DevCommandSessionState,
  support: DevCommandSupport,
) {
  const { projectRoot, context, ports, terminal } = state;
  const { compiler, logger, telemetry, inspection } = support;
  const files = yield* CliFileSystem;
  const generatedRoot = join(projectRoot, ".relkit", "generated");
  yield* files.mkdir(generatedRoot);
  const generatedDirectory = yield* Effect.acquireRelease(
    files.stage(join(generatedRoot, ".dev-")),
    (directory) => cleanupEffect("dev.generated.release", files.remove(directory)),
  );
  return yield* acquireDevSessionEffect({
    projectRoot,
    stablePort: ports.backend,
    generatedDirectory,
    signal: context.signal,
    installSignalHandlers: false,
    inspector: ports.inspector,
    compile: compiler.compile,
    localServicesEffect: compiler.closeEffect,
    sourceChangedEffect: () => compiler.invalidateEffect,
    candidateStopTimeoutMs: 30_000,
    logger,
    terminal,
    environment: {
      RELKIT_DEV_LOGS: "1",
      RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: process.env.RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS ?? "15000",
      ...telemetry.environment,
    },
    inspectionRecords: telemetry.records,
    inspectionIdentity: inspection.identity,
    inspectionPolicy: inspection.policyFor,
    inspectionApplied: inspection.applied,
    onRecord: telemetry.append,
    observability: { append: telemetry.append },
  });
});

/**
 * Owns the native SIGHUP listener until scoped shutdown.
 * @param session - Active session receiving the stop request.
 * @returns Listener acquisition; release removes only this listener.
 */
const installCommandHangup = Effect.fn("Dev.installCommandHangup")(function* (session: DevSession) {
  const hangup = () => {
    session.log({
      level: "info",
      event: "dev.shutdown.requested",
      fields: { signal: "SIGHUP" },
    });
    session.nativeEngine.requestStop(new Error("Received SIGHUP."));
  };
  yield* Effect.acquireRelease(
    cliTry("dev.hangup.install", () => {
      process.on("SIGHUP", hangup);
    }),
    () =>
      cleanupEffect(
        "dev.hangup.remove",
        cliTry("dev.hangup.remove", () => {
          process.removeListener("SIGHUP", hangup);
        }),
      ),
  );
});
