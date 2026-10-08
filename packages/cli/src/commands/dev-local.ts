import { Cause, Context, Effect, Layer, ManagedRuntime } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { cliOriginalError, cliPromise } from "../cli-errors.js";
import { CliCleanup } from "../services/cleanup.service.js";
import { localCapabilitiesLayer } from "../services/local-capabilities.js";
import { cliCleanupSnapshotUnsafe, retainCliCleanupFailures } from "../cli-cleanup-evidence.js";
import { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
import type { TelemetryConfiguration } from "@relkit/observability";
import type { DevLocalCompiler, EffectDevLocalCompiler } from "./dev-local.types.js";
export { checkedLocalArtifacts } from "./dev-local-services.js";
export { formatDevDiagnostics } from "./dev-local-diagnostics.js";
export { makeDevLocalCompilerEffect } from "./dev-local-compiler.js";
export type { DevLocalCompiler } from "./dev-local.types.js";

/** Private manual SDK compatibility owner; CLI commands use native factory acquisition. */
class ManualCompiler extends Context.Service<ManualCompiler, EffectDevLocalCompiler>()(
  "relkit/cli/ManualDevCompiler",
) {}

/**
 * Retains the public compiler/close Promise facade with one reused service runtime.
 * @param projectRoot - Authored project root.
 * @param localEnabled - Existing local-service policy.
 * @param configureTelemetry - Optional foreign configuration callback.
 * @param color - Existing diagnostic presentation.
 * @param backendPort - Stable backend port.
 * @returns Manual owner; concurrent closes join the same resources.
 */
export function createDevLocalCompiler(
  projectRoot: string,
  localEnabled = true,
  configureTelemetry?: (configuration: TelemetryConfiguration) => Promise<void> | undefined,
  color = false,
  backendPort = 3000,
): DevLocalCompiler {
  const runtime = ManagedRuntime.make(
    Layer.effect(
      ManualCompiler,
      makeDevLocalCompilerEffect({
        projectRoot,
        localEnabled,
        color,
        backendPort,
        ...(configureTelemetry
          ? {
              configureTelemetry: (configuration: TelemetryConfiguration) =>
                cliPromise("dev.telemetry.callback", () =>
                  Promise.resolve(configureTelemetry(configuration)),
                ).pipe(Effect.uninterruptible),
            }
          : {}),
      }),
    ).pipe(
      Layer.provideMerge(localCapabilitiesLayer),
      Layer.provideMerge(createLoggerLayer({ component: "cli", human: false, json: false })),
    ),
  );
  let closing: Promise<void> | undefined;
  const owner: DevLocalCompiler = {
    compile: async (request) => {
      const cleanup = await runExecutionPromise(runtime, CliCleanup);
      try {
        return await runExecutionPromise(
          runtime,
          ManualCompiler.use((service) => service.compileEffect(request)).pipe(
            Effect.mapError(cliOriginalError),
          ),
          { signal: request.signal },
        );
      } catch (error) {
        const original = request.signal?.aborted ? request.signal.reason : error;
        retainCliCleanupFailures(original, cliCleanupSnapshotUnsafe(cleanup));
        throw original;
      }
    },
    close: () =>
      (closing ??= (async () => {
        const cleanup = await runExecutionPromise(runtime, CliCleanup);
        let failure: unknown;
        try {
          await runtime.dispose();
        } catch (error) {
          failure = error;
        }
        retainCliCleanupFailures(owner, [
          ...cliCleanupSnapshotUnsafe(cleanup),
          ...(failure === undefined
            ? []
            : [{ operation: "dev.compiler.runtime.release", cause: Cause.fail(failure) }]),
        ]);
      })()),
  };
  return Object.freeze(owner);
}
