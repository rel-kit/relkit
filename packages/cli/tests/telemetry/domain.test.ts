import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import { createObservabilityStream } from "@relkit/observability";
import type { LocalWorkerEffects } from "@relkit/observability/local";
import { cliAdapterError, cliOriginalError } from "../../src/cli-errors.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliTelemetryNative } from "../../src/commands/dev-telemetry-native.service.js";
import { makeDevTelemetryEffect } from "../../src/commands/dev-telemetry.js";
import type { TelemetryNativeOperations } from "../../src/commands/dev-telemetry-native.types.js";

/**
 * Builds a deterministic native authority with no global process or listener fallback.
 * @param changes - Scenario-specific acquisition, IPC or release operations.
 * @returns Fresh native authority and an ordered physical release receipt.
 */
function fixture(changes: Partial<TelemetryNativeOperations> = {}) {
  const released: string[] = [];
  const worker: LocalWorkerEffects = {
    pid: undefined,
    call: (command) => Effect.succeed(command.type === "open" ? { records: 0, malformed: 0 } : []),
    close: () => Effect.void,
  };
  const native: TelemetryNativeOperations = {
    worker: () => Effect.succeed(worker),
    closeWorker: () =>
      Effect.sync(() => {
        released.push("worker");
      }),
    stream: () =>
      Effect.sync(() => {
        const stream = createObservabilityStream();
        return {
          ...stream,
          close: () => {
            released.push("stream");
            stream.close();
          },
        };
      }),
    listen: () =>
      Effect.succeed({
        url: "http://127.0.0.1:1234",
        stop: Effect.sync(() => {
          released.push("listener");
        }),
      }),
    ...changes,
  };
  return {
    released,
    native,
    layer: Layer.merge(Layer.succeed(CliTelemetryNative, native), cleanupLayer),
  };
}

it.effect("partial acquisition closes every prior owner and retains the listener primary", () => {
  const primary = new Error("listener acquisition failed");
  const f = fixture({ listen: () => Effect.fail(cliAdapterError("fixture.listen", primary)) });
  return Effect.scoped(
    Effect.gen(function* () {
      const exit = yield* Effect.exit(makeDevTelemetryEffect("/fixture"));
      if (Exit.isFailure(exit)) expect(cliOriginalError(Cause.squash(exit.cause))).toBe(primary);
      else throw new Error("Expected failed listener acquisition");
      expect(f.released).toEqual(["stream", "worker"]);
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect(
  "repeated concurrent close joins release, retaining secondary failures separately",
  () => {
    const release = new Error("listener release failed");
    const f = fixture({
      listen: () =>
        Effect.succeed({
          url: "http://127.0.0.1:1234",
          stop: Effect.fail(cliAdapterError("fixture.stop", release)),
        }),
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const telemetry = yield* makeDevTelemetryEffect("/fixture");
        yield* Effect.all([telemetry.closeEffect, telemetry.closeEffect, telemetry.closeEffect], {
          concurrency: 3,
        });
        expect(f.released).toEqual(["stream", "worker"]);
        const cleanup = yield* CliCleanup;
        const evidence = yield* cleanup.snapshot();
        expect(evidence.map((issue) => issue.operation)).toEqual([
          "dev.telemetry.listener.release",
        ]);
        expect(cliOriginalError(Cause.squash(evidence[0]!.cause))).toBe(release);
      }),
    ).pipe(Effect.provide(f.layer));
  },
);

it.effect(
  "worker callbacks publish baseline failure before notification and retain session isolation",
  () => {
    const failure = new Error("native worker failed immediately");
    const f = fixture({
      worker: (notify) =>
        Effect.sync(() => {
          notify(failure);
          return {
            pid: undefined,
            call: () => Effect.succeed({ records: 0, malformed: 0 }),
            close: () => Effect.void,
          };
        }),
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const first = yield* makeDevTelemetryEffect("/fixture", {}, () => {
          throw new Error("notification failure");
        });
        expect(first.status()).toMatchObject({ state: "degraded", error: failure.message });
        const second = yield* makeDevTelemetryEffect("/other").pipe(
          Effect.provideService(CliTelemetryNative, fixture().native),
        );
        expect(second.status()).toMatchObject({ state: "ready", error: undefined });
      }),
    ).pipe(Effect.provide(f.layer));
  },
);

it.effect("query IPC rejects invalid native replies before exposing them to public callers", () => {
  const f = fixture({
    worker: () =>
      Effect.succeed({
        pid: undefined,
        call: (command) =>
          Effect.succeed(
            command.type === "open"
              ? { records: 0, malformed: 0 }
              : { items: [], protocol: "wrong", version: 1 },
          ),
        close: () => Effect.void,
      }),
  });
  return Effect.scoped(
    Effect.gen(function* () {
      const telemetry = yield* makeDevTelemetryEffect("/fixture");
      const exit = yield* Effect.exit(
        Effect.tryPromise({ try: () => telemetry.query.logs(), catch: (cause) => cause }),
      );
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(TypeError);
      else throw new Error("Expected invalid IPC reply rejection");
    }),
  ).pipe(Effect.provide(f.layer));
});
