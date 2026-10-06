import { Context, Effect, Layer, ManagedRuntime, References } from "effect";
import {
  ExecutionSuccessLogs,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import {
  createLoggerLayer,
  currentNativeEffectContext,
  withNativeEffectContext,
} from "@relkit/runtime-effect";
import { RuntimeEnvironment, runtimeEnvironmentLayer } from "./runtime-environment.js";
import { ServerRuntime, ServerRuntimeLive } from "./server-runtime.service.js";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeEnvironmentOptions, ServerRuntimeHost } from "./server-runtime.types.js";

/**
 * Builds the typed lifecycle runtime at the generated application boundary.
 * @param options - Existing failure sink and initial feature readiness.
 * @returns A host whose shutdown releases its ManagedRuntime exactly once.
 * @remarks Native callbacks receive the owner's AbortSignal. If an SDK ignores
 * cancellation, late successful acquisition releases the handle before rejecting.
 * @example
 * ```ts
 * import { createServerRuntimeHost } from "@relkit/cli/internal/server-runtime";
 * const host = await createServerRuntimeHost({ report: () => {} });
 * try { await host.resource("provider", async () => ({ closed: false }), (value) => { value.closed = true; }); }
 * finally { await host.shutdown(async () => {}); }
 * ```
 */
export async function createServerRuntimeHost(
  options: RuntimeEnvironmentOptions,
): Promise<ServerRuntimeHost> {
  const runtime = ManagedRuntime.make(
    ServerRuntimeLive.pipe(
      Layer.provideMerge(runtimeEnvironmentLayer(options)),
      Layer.provideMerge(createLoggerLayer(options.logger ?? { human: false, json: false })),
      Layer.provideMerge(
        Layer.succeed(References.CurrentLogAnnotations, options.annotations ?? {}),
      ),
    ),
  );
  const service = await runtime.runPromise(ServerRuntime);
  const environment = await runtime.runPromise(RuntimeEnvironment);
  let closedSnapshot: ReturnType<ServerRuntimeHost["snapshot"]> | undefined;
  let shutdown: Promise<ReturnType<ServerRuntimeHost["snapshot"]>> | undefined;
  /**
   * Maps a native callback into the internal typed failure channel.
   * @typeParam A - Native callback result.
   * @param operation - Fixed operation label.
   * @param callback - Native application or integration work.
   * @returns An interruptible lazy callback invocation.
   */
  const external = <A>(operation: string, callback: (signal: AbortSignal) => Promise<A>) =>
    Effect.withFiber((fiber) =>
      Effect.tryPromise({
        try: (signal) =>
          withNativeEffectContext(fiber.context, () =>
            callback(AbortSignal.any([signal, environment.controller.signal])),
          ),
        catch: (cause) => new ServerRuntimeFailure({ operation, cause }),
      }),
    );
  /**
   * Preserves original native exceptions at the Promise compatibility edge.
   * @typeParam A - Native result type.
   * @param effect - Fully provided lifecycle operation.
   * @returns A Promise rejecting with the original callback cause.
   */
  const run = <A>(effect: Effect.Effect<A, ServerRuntimeFailure>) =>
    runExecutionPromise(
      runtime,
      effect.pipe(
        Effect.provideService(
          ExecutionSuccessLogs,
          Context.get(currentNativeEffectContext() ?? Context.empty(), ExecutionSuccessLogs),
        ),
      ),
    ).catch((failure: unknown) => {
      throw failure instanceof ServerRuntimeFailure ? failure.cause : failure;
    });
  return {
    signal: environment.controller.signal,
    snapshot: () =>
      closedSnapshot ??
      runExecutionSync(
        runtime,
        service.snapshot().pipe(Effect.provideService(ExecutionSuccessLogs, false)),
      ),
    setReady: (area, ready) => runExecutionSync(runtime, service.setReady(area, ready)),
    awaitReady: (area) => runtime.runPromise(service.awaitReady(area)),
    resource: (
      operation,
      acquire,
      release,
      initialize = () => undefined,
      phase = "application",
      successLogs = true,
    ) =>
      run(
        service.resource(
          operation,
          Effect.acquireRelease(
            external(operation, (signal) =>
              servicePromise(() =>
                acquire(signal).then(async (value) => {
                  if (signal.aborted) {
                    try {
                      await release(value);
                    } catch (cause) {
                      await reportLateFailure(
                        new ServerRuntimeFailure({ operation: operation + ".late-release", cause }),
                      );
                    }
                    throw signal.reason;
                  }
                  return value;
                }),
              ),
            ).pipe(Effect.provideService(ExecutionSuccessLogs, successLogs)),
            (value) =>
              service.cleanup(
                operation + ".release",
                external(operation + ".release", async () => {
                  await release(value);
                }),
              ),
            { interruptible: true },
          ),
          (value) =>
            external(operation, async () => {
              await servicePromise(async () => {
                await initialize(value);
              });
            }),
          phase,
        ),
      ),
    track: (task) => run(service.track(task)),
    each: (values, task) =>
      run(
        service.each(values, (value) =>
          external("job-worker", async () => {
            await servicePromise(() => task(value));
          }),
        ),
      ),
    worker: (operation, pass) =>
      run(
        service.worker(
          operation,
          external(operation, async () => {
            await servicePromise(pass);
          }).pipe(Effect.provideService(ExecutionSuccessLogs, false)),
        ),
      ),
    retry: (operation, action) =>
      run(
        service.retry(
          operation,
          external(operation, async () => {
            await servicePromise(action);
          }),
        ),
      ),
    providerDelay: () => runtime.runPromise(service.providerDelay()),
    failure: (operation, cause, cleanup = false) =>
      runtime.runSync(service.failure(new ServerRuntimeFailure({ operation, cause }), cleanup)),
    cleanup: (operation, task) => run(service.cleanup(operation, external(operation, task))),
    shutdown: (beforeRelease, beforeTelemetry = async () => {}) =>
      (shutdown ??= run(
        service.shutdown(
          external("runtime.before-release", async () => {
            await beforeRelease();
          }),
          external("runtime.before-telemetry", async () => {
            await beforeTelemetry();
          }),
        ),
      )
        .then((snapshot) => {
          closedSnapshot = snapshot;
          return snapshot;
        })
        .finally(() => runtime.dispose())),
  };

  /**
   * Tracks a native worker pass before awaiting it.
   * @typeParam A - Native completion result.
   * @param pass - Callback that starts physical worker activity.
   * @returns Its generation-tracked completion Promise.
   */
  function servicePromise<A>(pass: () => Promise<A>) {
    return run(service.track(pass()));
  }

  /**
   * Retains late cleanup evidence without allowing an observational sink to replace cancellation.
   * @param failure - Error from a native release after its acquisition was interrupted.
   * @returns After publication; sink failures remain observational even after disposal.
   */
  async function reportLateFailure(failure: ServerRuntimeFailure): Promise<void> {
    if (closedSnapshot === undefined) {
      try {
        await runExecutionPromise(runtime, service.failure(failure, true));
        return;
      } catch {
        /* Disposal can race a late native completion. */
      }
    }
    if (closedSnapshot !== undefined)
      closedSnapshot = {
        ...closedSnapshot,
        cleanupFailures:
          closedSnapshot.cleanupFailures.length < 32
            ? [...closedSnapshot.cleanupFailures, failure]
            : [
                ...closedSnapshot.cleanupFailures.slice(0, 1),
                ...closedSnapshot.cleanupFailures.slice(-30),
                failure,
              ],
      };
    try {
      options.report(failure, true);
    } catch {
      /* A sink never owns the primary result. */
    }
  }
}
