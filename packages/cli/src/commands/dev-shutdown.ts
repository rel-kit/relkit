import { Deferred, Effect, Fiber, Layer, Queue, Ref } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { runCliEffect, observeCli } from "../cli-runtime.js";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";
import { CliDevSupervisor, devSupervisorLayer } from "../services/dev-supervisor.service.js";
import type { DevSession } from "./dev-session.js";

/**
 * Stops request-producing children concurrently with the stable listener, then joins workers.
 * @param session - Native owner or retained public compatibility facade.
 * @param reason - Original shutdown reason.
 * @param worker - Native queued activation worker when acquired.
 * @returns Cleanup completion; secondary failures remain in the invocation ledger.
 */
export const shutdownDevEffect = Effect.fn("Dev.shutdown")(
  function* (session: DevSession, reason: unknown, worker?: Fiber.Fiber<void>) {
    const sdk = yield* CliDevSupervisor;
    session.markStopping();
    session.log({
      level: "info",
      event: "dev.shutdown.started",
      fields: { message: reason instanceof Error ? reason.message : String(reason) },
    });
    session.abortController.abort(reason);
    yield* cleanupEffect(
      "dev.stopping.callback",
      cliTry("dev.stopping.callback", () => session.options.onStopping?.()),
    );
    for (const controller of session.controllers) controller.abort(reason);
    if (worker) {
      const pending = (yield* Ref.get(session.state)).pending;
      yield* Effect.forEach(pending, (request) => Deferred.succeed(request.result, false), {
        discard: true,
      });
      yield* Ref.update(session.state, (state) => ({ ...state, pending: [] }));
    }
    const inspector = worker ? (yield* Ref.get(session.state)).inspector : undefined;
    const legacy = worker ? undefined : session.inspectorChild;
    const tasks = [
      cleanupEffect("dev.proxy.release", sdk.stopProxy(session.proxy)),
      ...(inspector
        ? [
            cleanupEffect("dev.inspector.release", inspector.stop),
            cleanupEffect("dev.inspector.output.release", inspector.output),
          ]
        : legacy
          ? [
              cleanupEffect(
                "dev.inspector.release",
                cliPromise("dev.inspector.stop", () => legacy.stop()),
              ),
              cleanupEffect(
                "dev.inspector.output.release",
                cliPromise("dev.inspector.output", () => legacy.output),
              ),
            ]
          : []),
      worker
        ? Fiber.interrupt(worker).pipe(Effect.asVoid)
        : cleanupEffect(
            "dev.activation.join",
            cliPromise("dev.activation.join", () => session.pendingActivations),
          ),
      ...[...session.drains.values()].map((drain) =>
        cleanupEffect("dev.drain.release", sdk.drain(drain)),
      ),
    ];
    yield* Effect.all(tasks, { concurrency: "unbounded", discard: true });
    if (worker) {
      yield* Queue.shutdown(session.nativeEngine.queue);
      yield* Ref.update(session.state, (state) => {
        const fingerprints = new Map(state.fingerprints);
        fingerprints.clear();
        const drains = new Map(state.drains);
        drains.clear();
        return { ...state, fingerprints, drains, controllers: new Set<AbortController>() };
      });
    }
    if (session.options.localServicesEffect)
      yield* cleanupEffect("dev.local-services.release", session.options.localServicesEffect);
    else if (session.options.localServices) {
      yield* cleanupEffect(
        "dev.local-services.release",
        cliPromise("dev.local-services.close", () => session.options.localServices!.close()).pipe(
          Effect.tapError((error) =>
            Effect.sync(() =>
              session.log({
                level: "error",
                event: "dev.local-services.cleanup-failed",
                fields: { message: error.message },
              }),
            ),
          ),
        ),
      );
    }
    yield* cleanupEffect(
      "dev.observability.release",
      cliPromise("dev.observability.flush", () => session.observability.flush()),
    );
    session.clearSignals();
    session.log({ level: "info", event: "dev.stopped" });
  },
  (effect, _session: DevSession, _reason: unknown, _worker?: Fiber.Fiber<void>) =>
    observeCli("dev.shutdown", effect.pipe(Effect.uninterruptible)),
);

/** Joins shutdown through the retained public session facade.
 * @param session - Public compatibility owner.
 * @param reason - Shutdown reason.
 * @returns Joined native cleanup.
 */
export function shutdownDev(session: DevSession, reason: unknown): Promise<void> {
  return runCliEffect(
    shutdownDevEffect(session, reason),
    Layer.merge(devSupervisorLayer, cleanupLayer),
  );
}
