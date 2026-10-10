/**
 * Starts the stable listener and validated backend independently from support.
 * Signal admission and background-worker registration are session-owned; the
 * backend Ready event contains only serving backend links, never a pending URL.
 */
import { Cause, Effect, Ref } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { CliPortProbe } from "./port-availability.service.js";
import { CliInspectorSupport } from "./dev-inspector-support.service.js";
import { installDevSignals } from "./dev-signals.js";
import { logDevReady } from "./dev-ready.js";
import { provideDevEngine } from "./dev-engine-state.js";
import type { DevEngineState } from "./dev-engine-state.types.js";
import type { DevSession } from "./dev-session.js";
import type { DevSessionEngine } from "./dev-session.types.js";

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
  logDevReady(session.log, session.options.hostname ?? "127.0.0.1", session.backendPort);
  yield* startBackgroundInspector(owner, session);
});

/**
 * Registers support atomically so explicit stop always sees its owned worker.
 * @param owner - Session Scope and worker reference.
 * @param session - Inspector policy and presentation sink.
 * @returns Registration completion; acquisition/HTTP readiness continue in the child.
 */
const startBackgroundInspector = Effect.fn("Dev.startSupport")(function* (
  owner: DevEngineState,
  session: DevSession,
) {
  if (session.options.inspector === undefined || session.options.inspector === false) return;
  const support = yield* CliInspectorSupport;
  const running = Effect.sleep(session.options.supportStartupDelayMs ?? 0).pipe(
    Effect.andThen(support.run(session)),
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
