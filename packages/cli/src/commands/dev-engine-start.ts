/**
 * Starts the stable listener and validated backend independently from support.
 * Signal admission and background-worker registration are session-owned; the
 * backend Ready event contains only serving backend links, never a pending URL.
 */
import { Cause, Effect, Fiber, Ref } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { CliPortProbe } from "./port-availability.service.js";
import { CliInspectorSupport } from "./dev-inspector-support.service.js";
import { installDevSignals } from "./dev-signals.js";
import { logDevReadyEffect } from "./dev-ready.js";
import { provideDevEngine } from "./dev-engine-state.js";
import type { DevEngineState } from "./dev-engine-state.types.js";
import type { DevSession } from "./dev-session.js";
import type { DevSessionEngine } from "./dev-session.types.js";
import type { DevInspectorPolicy } from "./dev-inspector-support.types.js";

/**
 * Opens backend admission and joins the first verified candidate.
 * @param owner - Captured native capabilities and startup serialization.
 * @param session - Session whose state/proxy owns public serving traffic.
 * @param engine - Only the admitted activation/stop operations used by startup.
 * @returns Backend readiness, rolling back physical startup on complete failure Cause.
 */
export function startDevEngine(
  owner: DevEngineState,
  session: DevSession,
  engine: Pick<DevSessionEngine, "activate" | "stop" | "requestStop">,
) {
  return observeCli(
    "dev.session.start",
    owner.startup
      .withPermits(1)(provideDevEngine(owner, startBackend(owner, session, engine)))
      .pipe(
        Effect.onExit((exit) => (exit._tag === "Failure" ? engine.stop(exit.cause) : Effect.void)),
      ),
  );
}

/**
 * Establishes the listener and background support before the first candidate.
 * @param owner - Session coordination and support-worker ownership.
 * @param session - Explicit native policy and state.
 * @param engine - Serialized activation and synchronous shutdown-request latch.
 * @returns Successful public backend activation; inspector startup is independent.
 */
const startBackend = Effect.fn("Dev.startBackend")(function* (
  owner: DevEngineState,
  session: DevSession,
  engine: Pick<DevSessionEngine, "activate" | "stop" | "requestStop">,
) {
  const sdk = yield* CliDevSupervisor;
  const ports = yield* CliPortProbe;
  yield* checkStartAdmission(session);
  if ((yield* Ref.get(session.state)).started) return;
  yield* cliTry("dev.session.signal", () => session.options.signal?.throwIfAborted());
  yield* Ref.update(session.state, (state) => ({ ...state, started: true }));
  session.log({ level: "info", event: "dev.starting" });
  const signals = yield* cliTry("dev.signals.install", () =>
    installDevSignals(session.options, session.log, engine.requestStop),
  );
  yield* Ref.update(session.state, (state) => ({ ...state, signals }));
  yield* ports.check(session.backendPort, session.options.hostname ?? "127.0.0.1", "--port");
  yield* sdk.listen(session.proxy);
  yield* checkStartAdmission(session);
  if (!(yield* engine.activate(0)))
    return yield* cliTry("dev.initial.failed", () => {
      throw new Error("Initial development candidate failed.");
    });
  yield* logDevReadyEffect(
    session.log,
    session.options.hostname ?? "127.0.0.1",
    session.backendPort,
    (yield* Ref.get(session.state)).active?.directory,
  );
  yield* startBackgroundInspector(owner, session);
});

/**
 * Registers support atomically so explicit stop always sees its owned worker.
 * @param owner - Session Scope, worker reference and selected bridge policy.
 * @param session - Inspector identity and presentation sink.
 * @returns Registration completion; acquisition/HTTP readiness continue in the child.
 */
const startBackgroundInspector = Effect.fn("Dev.startSupport")(function* (
  owner: DevEngineState,
  session: DevSession,
) {
  yield* owner.inspectorSwitch.withPermits(1)(
    Effect.gen(function* () {
      if ((yield* Ref.get(owner.inspector)) !== undefined) return;
      yield* forkInspectorSupport(
        owner,
        session,
        yield* Ref.get(owner.inspectorPolicy),
        session.options.supportStartupDelayMs ?? 0,
      );
    }),
  );
});

/**
 * Replaces the bridge after a promoted generation changed its inspector policy.
 * @param owner - Session Scope, worker reference and current bridge policy.
 * @param session - Inspector identity, policy observer and presentation sink.
 * @param policy - Bind policy selected by the promoted generation; false closes the bridge.
 * @returns Completion after the previous bridge released, the replacement registered and
 * the applied policy was reported.
 */
export const reconfigureInspector = Effect.fn("Dev.reconfigureSupport")(function* (
  owner: DevEngineState,
  session: DevSession,
  policy: DevInspectorPolicy,
) {
  const applied = yield* owner.inspectorSwitch.withPermits(1)(
    Effect.gen(function* () {
      if (yield* Ref.get(owner.closing)) return false;
      if (sameInspectorPolicy(yield* Ref.get(owner.inspectorPolicy), policy)) return true;
      const previous = yield* Ref.getAndSet(owner.inspector, undefined);
      if (previous !== undefined) yield* Fiber.interrupt(previous);
      yield* Ref.set(owner.inspectorPolicy, policy);
      if (policy === false)
        yield* cliTry("dev.inspector.stopped", () =>
          session.log({ level: "info", event: "dev.inspector.stopped" }),
        ).pipe(
          Effect.catchCause((cause) => owner.cleanup.record("dev.inspector.diagnostic", cause)),
        );
      else yield* forkInspectorSupport(owner, session, policy, 0);
      return true;
    }),
  );
  // Reported for every promotion so policy-owned resources follow the serving generation.
  if (applied) yield* session.options.inspectionApplied?.(policy) ?? Effect.void;
});

/**
 * Forks one bridge lifetime into the session Scope and records it for stop/replacement.
 * @param owner - Session Scope, cleanup receipts and worker reference.
 * @param session - Inspector identity and presentation sink.
 * @param policy - Bind policy; false registers no worker.
 * @param delayMs - Grace period before acquisition.
 * @returns Registration completion; failures degrade without stopping backend traffic.
 */
function forkInspectorSupport(
  owner: DevEngineState,
  session: DevSession,
  policy: DevInspectorPolicy,
  delayMs: number,
) {
  return Effect.gen(function* () {
    if (policy === false) return;
    const support = yield* CliInspectorSupport;
    const running = Effect.sleep(delayMs).pipe(
      Effect.andThen(support.run(session, policy)),
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.void;
        return owner.cleanup.record("dev.inspector.support", cause).pipe(
          Effect.andThen(
            cliTry("dev.inspector.failed", () =>
              session.log({
                level: "error",
                event: "dev.inspector.failed",
                fields: { message: "Inspector unavailable; backend remains serving." },
              }),
            ).pipe(
              Effect.catchCause((logCause) =>
                owner.cleanup.record("dev.inspector.diagnostic", logCause),
              ),
            ),
          ),
        );
      }),
    );
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkIn(restore(running), owner.scope);
        yield* Ref.set(owner.inspector, fiber);
      }),
    );
  });
}

/**
 * Compares bind policies by their effective listener address.
 * @param left - Current policy.
 * @param right - Requested policy.
 * @returns Whether both close the bridge or bind the same host and port.
 */
function sameInspectorPolicy(left: DevInspectorPolicy, right: DevInspectorPolicy): boolean {
  if (left === false || right === false) return left === right;
  return left.host === right.host && left.port === right.port;
}

/**
 * Checks synchronous cancellation immediately before native startup mutations.
 * @param session - Owner whose abort signal and stopping flag close admission.
 * @returns Completion or a typed adapter failure preserving the original reason.
 */
function checkStartAdmission(session: DevSession) {
  return cliTry("dev.session.startAdmission", () => {
    session.abortController.signal.throwIfAborted();
    if (session.isStopping) throw new Error("Development session is stopping.");
  });
}
