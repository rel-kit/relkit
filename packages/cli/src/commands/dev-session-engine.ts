import { Cause, Deferred, Effect, Layer, Queue, Ref, Scope, Semaphore } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupLayer, cleanupEffect } from "../services/cleanup.service.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { CliDevSupervisor, devSupervisorLayer } from "../services/dev-supervisor.service.js";
import { CliPortProbe, portProbeLayer } from "./port-availability.service.js";
import { CliSourceWatch, sourceWatchLayer } from "../services/source-watch.service.js";
import { activateCandidateEffect, drainCandidateEffect } from "./dev-activation.js";
import { startInspectorEffect } from "./dev-process.js";
import { installDevSignals } from "./dev-signals.js";
import { logDevReady } from "./dev-ready.js";
import { shutdownDevEffect } from "./dev-shutdown.js";
import { makeDevSourceWatcherEffect } from "./dev-watch.js";
import type { DevSession } from "./dev-session.js";
import type { DevActivationRequest, DevSessionEngine } from "./dev-session.types.js";

/** Native SDK/file/probe authorities acquired only for a selected dev command or public start. */
export const devSessionCapabilitiesLayer = Layer.mergeAll(
  devSupervisorLayer,
  fileSystemLayer,
  portProbeLayer,
  cleanupLayer,
  sourceWatchLayer,
);

/**
 * Captures one session's authorities, queue, shutdown latch and parent Scope.
 * @param session - Public facade whose state belongs exclusively to this owner.
 * @returns Native operations with no hidden requirements; closing joins all physical work.
 */
export const makeDevSessionEngineEffect = Effect.fn("Dev.acquireSession")(
  function* (session: DevSession) {
    const scope = yield* Scope.Scope;
    const sdk = yield* CliDevSupervisor;
    const files = yield* CliFileSystem;
    const cleanup = yield* CliCleanup;
    const ports = yield* CliPortProbe;
    const sourceWatch = yield* CliSourceWatch;
    const queue = yield* Queue.make<DevActivationRequest>();
    const requested = yield* Deferred.make<unknown>();
    const closed = yield* Deferred.make<void>();
    const closing = yield* Ref.make(false);
    const startup = yield* Semaphore.make(1);
    const capture = <A, E, R>(
      effect: Effect.Effect<
        A,
        E,
        R | CliDevSupervisor | CliFileSystem | CliCleanup | CliPortProbe | CliSourceWatch
      >,
    ) =>
      effect.pipe(
        Effect.provideService(CliDevSupervisor, sdk),
        Effect.provideService(CliFileSystem, files),
        Effect.provideService(CliCleanup, cleanup),
        Effect.provideService(CliPortProbe, ports),
        Effect.provideService(CliSourceWatch, sourceWatch),
      );
    const worker = yield* Effect.forkIn(
      Effect.forever(
        Effect.gen(function* () {
          const request = yield* Queue.take(queue);
          const state = yield* Ref.get(session.state);
          yield* Deferred.complete(
            request.result,
            state.stopping || state.latestVersion !== request.version
              ? Effect.succeed(false)
              : capture(activateCandidateEffect(session, request.version, request.changedFiles)),
          );
          yield* Ref.update(session.state, (state) => ({
            ...state,
            pending: state.pending.filter((entry) => entry !== request),
          }));
        }),
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : cleanup.record("dev.activation.worker", cause),
        ),
      ),
      scope,
    );

    const stop = (reason: unknown = new Error("Development session stopped.")) =>
      observeCli(
        "dev.session.stop",
        Effect.uninterruptible(
          Effect.gen(function* () {
            if (!(yield* Ref.getAndSet(closing, true))) {
              session.markStopping();
              session.abortController.abort(reason);
              yield* Deferred.complete(
                closed,
                startup.withPermits(1)(capture(shutdownDevEffect(session, reason, worker))),
              );
            }
            yield* Deferred.await(closed);
          }),
        ),
      );
    const activate = (version?: number, changedFiles: readonly string[] = []) =>
      observeCli(
        "dev.session.activate",
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const result = yield* Deferred.make<
              boolean,
              import("../cli-errors.js").CliAdapterError
            >();
            const request = yield* Ref.modify(session.state, (state) => {
              const next = version ?? state.latestVersion + 1;
              if (state.stopping || next < state.latestVersion) return [undefined, state] as const;
              for (const controller of state.controllers)
                controller.abort(new Error("A newer source version superseded this candidate."));
              const request = { version: next, changedFiles, result };
              return [
                request,
                { ...state, latestVersion: next, pending: [...state.pending, request] },
              ] as const;
            });
            if (!request) return false;
            yield* Queue.offer(queue, request);
            return yield* restore(Deferred.await(result));
          }),
        ),
      );
    const checkAdmission = cliTry("dev.session.startAdmission", () => {
      session.abortController.signal.throwIfAborted();
      if (session.isStopping) throw new Error("Development session is stopping.");
    });
    const start = observeCli(
      "dev.session.start",
      startup
        .withPermits(1)(
          Effect.gen(function* () {
            yield* checkAdmission;
            if ((yield* Ref.get(session.state)).started) return;
            yield* cliTry("dev.session.signal", () => session.options.signal?.throwIfAborted());
            yield* Ref.update(session.state, (state) => ({ ...state, started: true }));
            session.log({ level: "info", event: "dev.starting" });
            const signals = yield* cliTry("dev.signals.install", () =>
              installDevSignals(session.options, session.log, (reason) => {
                Deferred.doneUnsafe(requested, Effect.succeed(reason));
              }),
            );
            yield* Ref.update(session.state, (state) => ({ ...state, signals }));
            yield* ports.check(
              session.backendPort,
              session.options.hostname ?? "127.0.0.1",
              "--port",
            );
            yield* sdk.listen(session.proxy);
            yield* checkAdmission;
            if (session.options.inspector !== undefined && session.options.inspector !== false) {
              const inspector = yield* capture(
                startInspectorEffect(
                  session.options.inspector,
                  session.backendPort,
                  session.log,
                  session.options.spawn,
                ),
              ).pipe(Effect.provideService(Scope.Scope, scope));
              yield* Ref.update(session.state, (state) => ({ ...state, inspector }));
              yield* Effect.forkIn(
                cliPromise("dev.inspector.exit", () => inspector.process.exited).pipe(
                  Effect.flatMap((code) =>
                    Deferred.succeed(requested, new Error(`Inspector exited with code ${code}.`)),
                  ),
                  Effect.catch((error) => cleanup.record("dev.inspector.exit", Cause.fail(error))),
                ),
                scope,
              );
            }
            yield* checkAdmission;
            if (!(yield* activate(0)))
              return yield* cliTry("dev.initial.failed", () => {
                throw new Error("Initial development candidate failed.");
              });
            logDevReady(
              session.log,
              session.options.hostname ?? "127.0.0.1",
              session.backendPort,
              session.inspectorPort,
            );
          }),
        )
        .pipe(Effect.onExit((exit) => (exit._tag === "Failure" ? stop(exit.cause) : Effect.void))),
    );
    const engine = {
      scope,
      cleanup,
      queue,
      worker,
      start,
      activate,
      stop,
      wait: observeCli("dev.session.wait", Deferred.await(closed)),
      watch: capture(makeDevSourceWatcherEffect(session)).pipe(
        Effect.provideService(Scope.Scope, scope),
      ),
      requestStop: (reason: unknown) => {
        Deferred.doneUnsafe(requested, Effect.succeed(reason));
      },
      finish: () => {
        Deferred.doneUnsafe(closed, Effect.void);
      },
      drain: (previous, active) => capture(drainCandidateEffect(session, previous, active)),
    } satisfies DevSessionEngine;
    session.attach(engine);
    yield* Effect.addFinalizer(() => stop());
    yield* Effect.forkIn(Deferred.await(requested).pipe(Effect.flatMap(stop)), scope);
    return engine;
  },
  (effect, _session: DevSession) => observeCli("dev.session.acquire", effect),
);
