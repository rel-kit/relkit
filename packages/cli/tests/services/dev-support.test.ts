/**
 * Verifies independent inspector startup using deterministic Effect test Layers.
 * Backend readiness is a separate receipt; delayed acquisition, mixed failure
 * and bounded release are controlled by barriers rather than timing sleeps.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Fiber, Logger } from "effect";
import { cliAdapterError } from "../../src/cli-errors.js";
import { DevSession } from "../../src/commands/dev-session.js";
import { devSupportFixture, devSupportTestLayer } from "./dev-support-fixture.js";
import type { DevLogEvent } from "../../src/commands/dev.types.js";

/**
 * Creates a facade whose native listeners/children are replaced by test Layers.
 * @param events - Test-owned log evidence; no recorder feeds the telemetry buffer.
 * @param failed - Optional callback barrier for independent support failure.
 * @returns Pure constructed session; test Scope owns every subsequent operation.
 */
function session(
  events: DevLogEvent[],
  failed?: Deferred.Deferred<void>,
  supportStartupDelayMs = 0,
): DevSession {
  return new DevSession({
    projectRoot: "/deterministic-dev-support",
    stablePort: 12345,
    compile: () => Promise.reject(new Error("Unexpected compiler call")),
    inspector: { command: ["unused-test-child"], port: 12346 },
    supportStartupDelayMs,
    installSignalHandlers: false,
    logger: { human: false, json: false },
    onLog: (event) => {
      events.push(event);
      if (event.event === "dev.inspector.failed" && failed !== undefined)
        Deferred.doneUnsafe(failed, Effect.void);
    },
  });
}

it.effect("cancellation during support grace prevents inspector acquisition", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const events: DevLogEvent[] = [];
      let acquisitions = 0;
      const { engine } = yield* devSupportFixture(session(events, undefined, 50)).pipe(
        Effect.provide(
          devSupportTestLayer(() =>
            Effect.sync(() => {
              acquisitions += 1;
            }).pipe(Effect.andThen(Effect.never)),
          ),
        ),
      );
      yield* engine.start;
      expect(events.some((event) => event.event === "dev.ready")).toBe(true);
      yield* engine.stop();
      yield* engine.wait;
      expect(acquisitions).toBe(0);
    }),
  ).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("backend readiness completes while inspector acquisition remains pending", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const events: DevLogEvent[] = [];
      const { engine } = yield* devSupportFixture(session(events)).pipe(
        Effect.provide(
          devSupportTestLayer(() =>
            Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
          ),
        ),
      );
      yield* engine.start;
      yield* Deferred.await(entered);
      const ready = events.find((event) => event.event === "dev.ready");
      expect(ready?.fields?.backend).toBe("http://127.0.0.1:12345");
      expect(ready?.fields).not.toHaveProperty("inspector");
      expect(events.some((event) => event.event === "dev.inspector.ready")).toBe(false);
      yield* engine.stop();
    }),
  ).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("support failure retains mixed Cause evidence and leaves the backend running", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const failed = yield* Deferred.make<void>();
      const events: DevLogEvent[] = [];
      const facade = session(events, failed);
      const failure = cliAdapterError("inspector.test", new Error("Port conflict"));
      const cause = Cause.combine(Cause.fail(failure), Cause.die(new Error("Secondary defect")));
      const { engine } = yield* devSupportFixture(facade).pipe(
        Effect.provide(devSupportTestLayer(() => Effect.failCause(cause))),
      );
      yield* engine.start;
      yield* Deferred.await(failed);
      expect(facade.isStopping).toBe(false);
      expect(events.some((event) => event.event === "dev.ready")).toBe(true);
      const evidence = yield* engine.cleanup.snapshot();
      expect(
        evidence.some(
          (entry) =>
            entry.operation === "dev.inspector.support" && entry.cause.reasons.length === 2,
        ),
      ).toBe(true);
      yield* engine.stop();
    }),
  ).pipe(Effect.provide(Logger.layer([]))),
);

it.effect("stop joins inspector acquisition release before completing shutdown", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const releasing = yield* Deferred.make<void>();
      const released = yield* Deferred.make<void>();
      const { engine } = yield* devSupportFixture(session([])).pipe(
        Effect.provide(
          devSupportTestLayer(() =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Deferred.succeed(releasing, undefined).pipe(
                  Effect.andThen(Deferred.await(released)),
                ),
              ),
            ),
          ),
        ),
      );
      yield* engine.start;
      yield* Deferred.await(entered);
      const stopping = yield* engine.stop().pipe(Effect.forkChild);
      yield* Deferred.await(releasing);
      expect(stopping.pollUnsafe()).toBeUndefined();
      yield* Deferred.succeed(released, undefined);
      yield* Fiber.join(stopping);
      yield* engine.wait;
    }),
  ).pipe(Effect.provide(Logger.layer([]))),
);
