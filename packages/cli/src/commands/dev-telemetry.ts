import { Cause, Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect";
import type { TelemetryConfiguration } from "@relkit/observability";
import { cliOriginalError } from "../cli-errors.js";
import { CliCleanup, cleanupLayer } from "../services/cleanup.service.js";
import {
  cliCleanupFailures,
  cliCleanupSnapshotUnsafe,
  retainCliCleanupFailures,
} from "../cli-cleanup-evidence.js";
import { telemetryNativeLayer } from "./dev-telemetry-native.service.js";
import { makeDevTelemetryEffect } from "./dev-telemetry-operation.js";
import type { DevTelemetryEffects } from "./dev-telemetry.types.js";

export { makeDevTelemetryEffect } from "./dev-telemetry-operation.js";
export { telemetryConfigurationFromGraphEffect } from "./dev-telemetry-config.js";

/**
 * Preserves the Promise API with one explicit caller-owned telemetry lifetime.
 * @param projectRoot - Existing application root.
 * @param configuration - Model-owner configuration.
 * @param onFailure - Existing notification sink.
 * @returns Handle retained until memoized close physically joins all releases.
 * @remarks Scoped native callers use makeDevTelemetryEffect directly.
 */
export async function startDevTelemetry(
  projectRoot: string,
  configuration: TelemetryConfiguration = {},
  onFailure: (error: Error) => void = () => undefined,
) {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      telemetryNativeLayer,
      cleanupLayer,
      createLoggerLayer({ component: "cli", human: false, json: false }),
    ),
  );
  const scope = await runtime.runPromise(Scope.make());
  const cleanup = await runtime.runPromise(CliCleanup);
  let result: DevTelemetryEffects | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      let failure: unknown;
      try {
        await runExecutionPromise(runtime, Scope.close(scope, Exit.void));
      } catch (cause) {
        failure = cause;
      }
      try {
        await runtime.dispose();
      } catch (cause) {
        if (failure === undefined) failure = cause;
        else
          retainCliCleanupFailures(failure, [
            { operation: "dev.telemetry.owner.dispose", cause: Cause.fail(cause) },
          ]);
      }
      const evidence = cliCleanupSnapshotUnsafe(cleanup);
      if (result !== undefined) retainCliCleanupFailures(result, evidence);
      if (failure === undefined && evidence[0] !== undefined)
        failure = cliOriginalError(Cause.squash(evidence[0].cause));
      if (failure !== undefined) {
        retainCliCleanupFailures(failure, evidence);
        throw failure;
      }
    })());
  try {
    const native = await runExecutionPromise(
      runtime,
      makeDevTelemetryEffect(projectRoot, configuration, onFailure).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.mapError(cliOriginalError),
      ),
    );
    result = Object.freeze({ ...native, close });
    return result;
  } catch (primary) {
    await close().catch((secondary) =>
      retainCliCleanupFailures(primary, [
        { operation: "dev.telemetry.owner.release", cause: Cause.fail(secondary) },
        ...cliCleanupFailures(secondary),
      ]),
    );
    retainCliCleanupFailures(primary, cliCleanupSnapshotUnsafe(cleanup));
    throw primary;
  }
}
