/**
 * Owns independent inspector acquisition, HTTP readiness and process termination.
 * Dependencies are captured by make; the executing session supplies its Scope,
 * logger and cancellation. Backend activation never awaits this support worker.
 */
import { Context, Effect, Layer, Ref, Schedule } from "effect";
import { CliCleanup } from "../services/cleanup.service.js";
import { CliHttp, httpLayer } from "../services/http.service.js";
import { CliPortProbe } from "./port-availability.service.js";
import { startInspectorEffect } from "./dev-process.js";
import { cliPromise, cliTry, CliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { DevInspectorSupportOperations } from "./dev-inspector-support.types.js";
import type { HttpCapabilities } from "../services/http.types.js";
import type { DevSession } from "./dev-session.js";

/** Inspector support with shared native dependencies acquired at its Layer boundary. */
export class CliInspectorSupport extends Context.Service<
  CliInspectorSupport,
  DevInspectorSupportOperations
>()("relkit/cli/InspectorSupport", {
  make: Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    const ports = yield* CliPortProbe;
    const http = yield* CliHttp;
    return {
      run: Effect.fn("Dev.inspectorSupport")((session: DevSession) =>
        observeCli(
          "dev.inspector.support",
          runInspectorSupport(session, http).pipe(
            Effect.provideService(CliCleanup, cleanup),
            Effect.provideService(CliPortProbe, ports),
          ),
        ),
      ),
    } satisfies DevInspectorSupportOperations;
  }),
}) {}

/** Supplies support policy without acquiring any child before its run operation. */
export const inspectorSupportLayer = Layer.effect(
  CliInspectorSupport,
  CliInspectorSupport.make,
).pipe(Layer.provide(httpLayer));

/**
 * Holds the acquired child until exit or owner cancellation and joins its finalizers.
 * @param session - Support policy, state and independent presentation callback.
 * @param http - Captured bounded HTTP authority.
 * @returns Owned inspector lifetime; expected failures retain E and mixed Causes propagate.
 */
const runInspectorSupport = Effect.fn("Dev.inspectorLifetime")(function* (
  session: DevSession,
  http: HttpCapabilities,
) {
  const options = session.options.inspector;
  if (options === undefined || options === false) return;
  yield* Effect.scoped(
    Effect.gen(function* () {
      const inspector = yield* startInspectorEffect(
        options,
        session.backendPort,
        session.log,
        session.options.spawn,
      );
      yield* Ref.update(session.state, (state) => ({ ...state, inspector }));
      yield* Effect.addFinalizer(() =>
        Ref.update(session.state, (state) => ({ ...state, inspector: undefined })),
      );
      const exited = cliPromise("dev.inspector.exit", () => inspector.process.exited).pipe(
        Effect.flatMap((code) =>
          cliTry("dev.inspector.exit", () => {
            throw new Error(`Inspector exited with code ${code}.`);
          }),
        ),
      );
      yield* Effect.raceFirst(
        waitInspectorReady(http, inspector.port).pipe(
          Effect.andThen(
            cliTry("dev.inspector.ready", () =>
              session.log({
                level: "info",
                event: "dev.inspector.ready",
                fields: { inspector: `http://127.0.0.1:${inspector.port}` },
              }),
            ),
          ),
          Effect.andThen(Effect.never),
        ),
        exited,
      );
    }),
  );
});

/**
 * Probes a real inspector response within its independent startup deadline.
 * @param http - Acquired bounded HTTP authority.
 * @param port - Actual owned listener port.
 * @returns Completion after successful response bytes; failures cannot advertise readiness.
 */
const waitInspectorReady = Effect.fn("Dev.inspectorReady")(function* (
  http: HttpCapabilities,
  port: number,
) {
  const ready = Effect.scoped(
    Effect.gen(function* () {
      const response = yield* http.request(`http://127.0.0.1:${port}/`, { redirect: "manual" });
      if (response.status !== 200) return false;
      yield* http.text(response, 4_194_304);
      return true;
    }),
  ).pipe(
    Effect.catchCause((cause) => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1 &&
        reason?._tag === "Fail" &&
        reason.error instanceof CliAdapterError
      )
        return Effect.succeed(false);
      return Effect.failCause(cause);
    }),
  );
  yield* ready.pipe(
    Effect.repeat({ schedule: Schedule.spaced(25), until: (value) => value }),
    Effect.timeout(5_000),
    Effect.mapError(
      (cause) =>
        new CliAdapterError({
          operation: "dev.inspector.readiness",
          message: "Inspector did not become ready within its deadline.",
          cause,
        }),
    ),
  );
});
