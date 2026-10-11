/**
 * Acquires the development session's native engine and shared release receipt.
 * Candidate admission, backend startup and independent support have explicit
 * owners; callbacks submit lazy stop work without nesting an Effect runtime.
 */
import { Deferred, Effect, Layer, Scope } from "effect";
import { observeCli } from "../cli-runtime.js";
import { cleanupLayer } from "../services/cleanup.service.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import { devSupervisorLayer } from "../services/dev-supervisor.service.js";
import { portProbeLayer } from "./port-availability.service.js";
import { sourceWatchLayer } from "../services/source-watch.service.js";
import { drainCandidateEffect } from "./dev-activation.js";
import { makeDevSourceWatcherEffect } from "./dev-watch.js";
import { inspectorSupportLayer } from "./dev-inspector-support.service.js";
import { acquireDevEngineState, provideDevEngine } from "./dev-engine-state.js";
import { admitDevActivation, devActivationWorker } from "./dev-engine-activation.js";
import { startDevEngine } from "./dev-engine-start.js";
import { stopDevEngine } from "./dev-engine-stop.js";
import type { DevSession } from "./dev-session.js";
import type { DevSessionEngine } from "./dev-session.types.js";

const nativeCapabilities = Layer.mergeAll(
  devSupervisorLayer,
  fileSystemLayer,
  portProbeLayer,
  cleanupLayer,
  sourceWatchLayer,
);

/** Shared native authority, memoized for engine and support acquisition. */
export const devSessionCapabilitiesLayer = Layer.merge(
  nativeCapabilities,
  inspectorSupportLayer.pipe(Layer.provide(nativeCapabilities)),
);

/**
 * Captures authorities, queue, release coordination and the parent session Scope.
 * @param session - Public facade whose state belongs exclusively to this owner.
 * @returns Native operations; closing joins all physical work and background support.
 */
export const makeDevSessionEngineEffect = Effect.fn("Dev.acquireSession")(
  function* (session: DevSession) {
    const owner = yield* acquireDevEngineState();
    const worker = yield* Effect.forkIn(devActivationWorker(owner, session), owner.scope);
    const stop = <Reason>(reason?: Reason) => stopDevEngine(owner, session, worker, reason);
    const activate = (version?: number, changedFiles: readonly string[] = []) =>
      admitDevActivation(owner, session, version, changedFiles);
    const requestStop = <Reason>(reason: Reason): void => {
      Deferred.doneUnsafe(owner.requested, stop(reason));
    };
    const engine: DevSessionEngine = {
      scope: owner.scope,
      cleanup: owner.cleanup,
      queue: owner.queue,
      worker,
      start: startDevEngine(owner, session, { activate, stop, requestStop }),
      activate,
      stop,
      requestStop,
      wait: observeCli("dev.session.wait", Deferred.await(owner.closed)),
      watch: provideDevEngine(owner, makeDevSourceWatcherEffect(session)).pipe(
        Effect.provideService(Scope.Scope, owner.scope),
      ),
      finish: () => {
        Deferred.doneUnsafe(owner.closed, Effect.void);
      },
      drain: (previous, active) =>
        provideDevEngine(owner, drainCandidateEffect(session, previous, active)),
    };
    session.attach(engine);
    yield* Effect.addFinalizer(() => stop());
    yield* Effect.forkIn(Deferred.await(owner.requested), owner.scope);
    return engine;
  },
  (effect, _session: DevSession) => observeCli("dev.session.acquire", effect),
);
