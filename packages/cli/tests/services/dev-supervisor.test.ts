/**
 * Exercises development-session native ownership under cancellation. Test Layers
 * replace every listener, compiler and inspector boundary so assertions prove
 * joined cleanup and closed startup admission without opening external resources.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { createSupervisorProxy, type SupervisorProxy } from "@relkit/supervisor";
import { CliDevSupervisor, devSupervisorLayer } from "../../src/services/dev-supervisor.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliInspectorSupport } from "../../src/commands/dev-inspector-support.service.js";
import { sourceWatchLayer } from "../../src/services/source-watch.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { makeDevSessionEngineEffect } from "../../src/commands/dev-session-engine.js";
import { DevSession } from "../../src/commands/dev-session.js";
import { filesystemTestLayer } from "./test-layers.js";

it.live("interrupted listener startup settles physically before a competing stop", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let release: (() => void) | undefined;
    let open = false;
    const order: string[] = [];
    const base = createSupervisorProxy({ port: 0 });
    const proxy: SupervisorProxy = Object.assign(base, {
      listen: async () => {
        Deferred.doneUnsafe(entered, Effect.void);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        open = true;
        order.push("listen");
        return proxy;
      },
      stop: async () => {
        open = false;
        order.push("stop");
      },
    });
    const sdk = yield* CliDevSupervisor;
    const listening = yield* sdk.listen(proxy).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    const interrupted = yield* Fiber.interrupt(listening).pipe(Effect.forkChild);
    const stopping = yield* sdk.stopProxy(proxy).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    expect(interrupted.pollUnsafe()).toBeUndefined();
    expect(stopping.pollUnsafe()).toBeUndefined();
    expect(order).toEqual([]);
    release?.();
    yield* Fiber.join(interrupted);
    yield* Fiber.join(stopping);
    expect(open).toBe(false);
    expect(order).toEqual(["listen", "stop"]);
  }).pipe(Effect.provide(devSupervisorLayer)),
);

it.live(
  "session shutdown joins delayed startup and prevents later inspector acquisition",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const released = yield* Deferred.make<void>();
      let stops = 0;
      const forbidden = () => Effect.die(new Error("Startup admitted work after shutdown."));
      const sdk = Layer.succeed(
        CliDevSupervisor,
        CliDevSupervisor.of({
          start: forbidden,
          verify: forbidden,
          dispose: forbidden,
          drain: forbidden,
          listen: () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(released)),
              Effect.uninterruptible,
            ),
          stopProxy: () =>
            Effect.sync(() => {
              stops += 1;
            }),
        }),
      );
      const graph = Layer.mergeAll(
        sdk,
        sourceWatchLayer,
        cleanupLayer,
        filesystemTestLayer(),
        Layer.succeed(CliPortProbe, CliPortProbe.of({ check: () => Effect.void })),
        Layer.succeed(CliInspectorSupport, CliInspectorSupport.of({ run: forbidden })),
      );
      const session = new DevSession({
        projectRoot: process.cwd(),
        stablePort: 0,
        installSignalHandlers: false,
        inspector: {
          command: [process.execPath, "-e", "throw new Error('inspector must not spawn')"],
          port: 0,
        },
        compile: () => {
          throw new Error("Compiler must not start.");
        },
        logger: { human: false, json: false },
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* makeDevSessionEngineEffect(session);
          const starting = yield* engine.start.pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          const stopping = yield* engine
            .stop(new Error("Stopped during native listen."))
            .pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          expect(session.isStopping).toBe(true);
          expect(stopping.pollUnsafe()).toBeUndefined();
          yield* Deferred.succeed(released, undefined);
          expect(Exit.isFailure(yield* Fiber.await(starting))).toBe(true);
          yield* Fiber.join(stopping);
          expect(session.inspectorChild).toBeUndefined();
          expect(session.fingerprints.size).toBe(0);
          expect(stops).toBe(1);
        }),
      ).pipe(Effect.provide(graph));
    }),
  10_000,
);
