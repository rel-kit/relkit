/**
 * Selects prepared startup before loading the full CLI graph. Expected snapshot
 * misses return control to safe dispatch after Scope release; accepted snapshots
 * execute through the existing session/supervisor and retain their input watch.
 */
import { resolve } from "node:path";
import { Cause, Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { cliAdapterError, cliOriginalError, cliTry, cliValidation } from "../cli-errors.js";
import { runCliEffect } from "../cli-runtime.js";
import { parseProjectArgs } from "../commands/project-args.js";
import { resolveApplicationPort } from "../commands/ports.js";
import { telemetryConfigurationSchema } from "../commands/dev-telemetry-config.schemas.js";
import { CliTelemetryRelays } from "../commands/dev-telemetry-relay.service.js";
import { preparedSessionOptions } from "./snapshot-session-options.js";
import { activatePreparedSession } from "./snapshot-command-activation.js";
import { acquireSnapshotSessionDirectory } from "./snapshot-session-directory.js";
import { DevSession } from "../commands/dev-session.js";
import { CliCleanup } from "../services/cleanup.service.js";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotEpochs } from "./snapshot-epoch.service.js";
import { DevSnapshots } from "./snapshot.service.js";
import { SnapshotSessionCompilers } from "./snapshot-session-compiler.service.js";
import { readSnapshotTools } from "./snapshot-tools.js";
import { preparedDevRuntime } from "./snapshot-command-runtime.js";
import type { PreparedDevSelection } from "./snapshot-command.types.js";
import type { SnapshotCommandPreflight } from "./snapshot-preflight.types.js";

/**
 * Runs a prepared dev command at the native Promise edge, or reports a safe-path miss.
 * @param args - Dev's original project options, without the command token.
 * @param signal - Executable-owned invocation cancellation.
 * @returns True after a prepared session closes, false before any listener on a miss.
 */
export function runPreparedDev(
  args: readonly string[],
  signal: AbortSignal,
  preflight?: SnapshotCommandPreflight,
): Promise<boolean> {
  return runCliEffect(
    Effect.gen(function* () {
      const selected = yield* selectPreparedDev(args, preflight);
      if (selected === undefined) return false;
      yield* runPreparedSession(selected, signal);
      return true;
    }).pipe(
      Effect.catchCause((cause) =>
        isSnapshotMiss(cause) ? Effect.succeed(false) : Effect.failCause(cause),
      ),
    ),
    preparedDevRuntime,
    signal,
  );
}

/**
 * Observes inputs before complete byte validation and recovers singleton expected misses only.
 * @param args - Project-root, port and existing dev flags.
 * @returns One data-only accepted selection or absence; defects/interruption stay failures.
 */
const selectPreparedDev = Effect.fn("DevSnapshot.select")(function* (
  args: readonly string[],
  preflight?: SnapshotCommandPreflight,
) {
  const options = yield* cliValidation(() => parseProjectArgs(args, "dev"));
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const epochs = yield* SnapshotEpochs;
  const snapshots = yield* DevSnapshots;
  const matching = preflight?.root === projectRoot ? preflight : undefined;
  const epoch = yield* epochs.begin(projectRoot, matching?.epoch);
  const token = yield* epoch.current;
  const tools = yield* readSnapshotTools(projectRoot);
  const currentMembers =
    matching !== undefined && matching.startRevision === token.revision
      ? {
          generation: matching.generation,
          verification: Effect.tryPromise({
            try: () => matching.mismatch,
            catch: (cause) =>
              new DevSnapshotIoError({
                operation: "members.preflight",
                cause: new Error("Snapshot integrity preflight failed", { cause }),
              }),
          }).pipe(
            Effect.flatMap((mismatch) =>
              mismatch === undefined
                ? Effect.void
                : Effect.fail(
                    new DevSnapshotRejected({
                      reason: "stale",
                      operation: "members.preflight",
                    }),
                  ),
            ),
            Effect.andThen(epoch.verify(token)),
          ),
        }
      : undefined;
  const staged = yield* snapshots.stage(projectRoot, tools, currentMembers);
  yield* epoch.verify(token);
  if (staged.snapshot.receipt.ports === undefined) return undefined;
  return {
    projectRoot,
    options,
    snapshot: staged.snapshot,
    epoch,
    token,
    verification: staged.verification,
  } satisfies PreparedDevSelection;
});

/** Recognizes only one expected snapshot failure after restoring adapter causes. */
function isSnapshotMiss(cause: Cause.Cause<unknown>): boolean {
  const reason = cause.reasons[0];
  const error = reason?._tag === "Fail" ? cliOriginalError(reason.error) : undefined;
  return (
    cause.reasons.length === 1 &&
    (error instanceof DevSnapshotRejected || error instanceof DevSnapshotIoError)
  );
}

/**
 * Acquires prepared execution through the established supervisor and watcher lifetime.
 * @param selected - Single immutable validation result with its still-owned epoch.
 * @param signal - Invocation cancellation retained through all resource cleanup.
 * @returns Joined session shutdown; Ready is emitted only after full verification and activation.
 */
const runPreparedSession = Effect.fn("DevSnapshot.runSession")(function* (
  selected: PreparedDevSelection,
  signal: AbortSignal,
) {
  const { options, snapshot, projectRoot } = selected;
  const generatedDirectory = yield* acquireSnapshotSessionDirectory(projectRoot);
  const backendPort = yield* cliTry("dev.snapshot.port", () =>
    resolveApplicationPort({
      ...(options.port === undefined ? {} : { flag: options.port }),
      source: process.env,
      ...(snapshot.receipt.ports === undefined
        ? {}
        : { configured: snapshot.receipt.ports.backend }),
    }),
  );
  const configuration = yield* Schema.decodeUnknownEffect(telemetryConfigurationSchema)(
    snapshot.graph.nodes.find((node) => node.kind === "app")?.telemetry ?? {},
    { onExcessProperty: "error" },
  ).pipe(mapErrorCause((error) => cliAdapterError("dev.snapshot.telemetry", error)));
  const telemetry = yield* CliTelemetryRelays.use((service) =>
    service.acquire(projectRoot, configuration),
  );
  const compilers = yield* SnapshotSessionCompilers;
  const compiler = yield* compilers.acquire({
    ...selected,
    options: {
      projectRoot,
      backendPort,
      color: !options.noColor,
      localEnabled: options.local !== "off",
      configureTelemetry: telemetry.configureEffect,
    },
  });
  const sessionOptions = preparedSessionOptions(
    selected,
    compiler,
    telemetry,
    backendPort,
    signal,
    generatedDirectory,
  );
  const session = yield* cliTry("dev.snapshot.session", () => new DevSession(sessionOptions));
  const engine = yield* activatePreparedSession(session, telemetry);
  yield* watchPreparedSession(selected, session);
  yield* engine.wait;
});

/**
 * Coalesces every source/dependency epoch into existing serialized safe activation.
 * @param selected - Input watch owned since before snapshot validation.
 * @param session - Established supervisor with last-known-good traffic retention.
 * @returns Scoped worker; watcher defects/failures request shutdown after full Cause retention.
 */
const watchPreparedSession = Effect.fn("DevSnapshot.watchSession")(function* (
  selected: PreparedDevSelection,
  session: DevSession,
) {
  const cleanup = yield* CliCleanup;
  return yield* Effect.forkScoped(
    Effect.forever(
      selected.epoch.changed.pipe(
        Effect.andThen(Effect.sleep(75)),
        Effect.andThen(session.nativeEngine.activate(undefined, ["prepared-inputs"])),
      ),
    ).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : cleanup
              .record("dev.snapshot.watch", cause)
              .pipe(
                Effect.andThen(
                  Effect.sync(() => session.nativeEngine.requestStop(Cause.squash(cause))),
                ),
              ),
      ),
    ),
  );
});
