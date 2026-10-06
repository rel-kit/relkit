import { admitObservabilityRecord } from "@relkit/observability";
import { Effect, Ref } from "effect";
import { join, resolve } from "node:path";
import { cliTry, cliValidation } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliProject } from "../services/project.service.js";
import { fail } from "../main-support.js";
import type { CliCommandContext } from "../main-support-types.js";
import type { DevOptions } from "./dev.types.js";
import { acquireDevSessionEffect } from "./dev.js";
import { createDevLogger, devLogSinks } from "./dev-logger.js";
import { developmentPortsEffect } from "./dev-inspector.js";
import { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
import { formatDevDiagnostics } from "./dev-local-diagnostics.js";
import { parseProjectArgs } from "./project-args.js";
import { makeDevTelemetryEffect, telemetryConfigurationFromGraphEffect } from "./dev-telemetry.js";

/**
 * Composes retention, compiler/local services, generated stage, stable session and watcher.
 * @param args - Existing dev command flags.
 * @param context - Scoped invocation cancellation and output policy.
 * @returns Completion after all session work and native cleanup have joined.
 */
export const devCommandOperationEffect = Effect.fn("Dev.command")(
  function* (args: readonly string[], context: CliCommandContext) {
    const options = yield* cliValidation(() => parseProjectArgs(args, "dev"));
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const files = yield* CliFileSystem;
    const project = yield* CliProject;
    const ports = yield* developmentPortsEffect(
      projectRoot,
      options.port,
      options.inspectorPort,
      process.env,
    );
    const terminal = {
      verbose: options.verbose ?? false,
      color:
        !options.noColor &&
        !context.json &&
        process.env.NO_COLOR === undefined &&
        process.stderr.isTTY === true,
    };
    // The initial retention check precedes session acquisition. Its CPU-heavy
    // compiler must have a process owner so SIGTERM can interrupt and join it.
    const checked = yield* project.checkDevelopment({
      projectRoot,
      generationId: `dev-initial-${crypto.randomUUID()}`,
    });
    if (!checked.ok)
      return yield* Effect.fail(
        fail(
          "RELKIT_DEV_COMPILE_FAILED",
          formatDevDiagnostics(projectRoot, checked.diagnostics, terminal.color),
        ),
      );
    const configuration = yield* Ref.make(
      yield* telemetryConfigurationFromGraphEffect(checked.outputs.graph),
    );
    const logger: NonNullable<DevOptions["logger"]> = {
      redact: (record) => {
        const safe = admitObservabilityRecord(record, Ref.getUnsafe(configuration).redaction);
        return safe?.signal === "log" ? safe : record;
      },
      minimumLevel: options.logLevel ?? (options.verbose ? "debug" : "info"),
      ...devLogSinks(context.json, context.io?.stderr),
    };
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const configured = yield* Ref.make<
          Effect.Success<ReturnType<typeof makeDevTelemetryEffect>> | undefined
        >(undefined);
        const compiler = yield* makeDevLocalCompilerEffect({
          projectRoot,
          localEnabled: options.local !== "off",
          color: terminal.color,
          backendPort: ports.backend,
          configureTelemetry: (next) =>
            Ref.set(configuration, next).pipe(
              Effect.andThen(
                Effect.suspend(
                  () => Ref.getUnsafe(configured)?.configureEffect(next) ?? Effect.void,
                ),
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
        const generatedRoot = join(projectRoot, ".relkit", "generated");
        yield* files.mkdir(generatedRoot);
        const generatedDirectory = yield* Effect.acquireRelease(
          files.stage(join(generatedRoot, ".dev-")),
          (directory) => cleanupEffect("dev.generated.release", files.remove(directory)),
        );
        const session = yield* acquireDevSessionEffect({
          projectRoot,
          stablePort: ports.backend,
          generatedDirectory,
          signal: context.signal,
          installSignalHandlers: false,
          inspector: { ...ports.inspector, environment: { FORCE_COLOR: "0", NO_COLOR: undefined } },
          compile: compiler.compile,
          localServicesEffect: compiler.closeEffect,
          sourceChangedEffect: () => compiler.invalidateEffect,
          candidateStopTimeoutMs: 30_000,
          logger,
          terminal,
          environment: {
            RELKIT_DEV_LOGS: "1",
            RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS:
              process.env.RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS ?? "15000",
            ...telemetry.environment,
          },
          intercept: telemetry.handle,
          onStopping: telemetry.closeStream,
          onRecord: telemetry.append,
          observability: { append: telemetry.append },
        });
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
        yield* session.nativeEngine.watch;
        yield* session.nativeEngine.wait;
      }),
    );
  },
  (effect, _args: readonly string[], _context: CliCommandContext) =>
    observeCli("dev.command", effect),
);
