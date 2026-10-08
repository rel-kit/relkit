import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Layer } from "effect";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { makeDevSessionEngineEffect } from "../../src/commands/dev-session-engine.js";
import { makeDevSourceWatcherEffect } from "../../src/commands/dev-watch.js";
import { DevSession } from "../../src/commands/dev-session.js";
import { filesystemTestLayer } from "./test-layers.js";

it.live(
  "native watch failure is supervised and every stop joins despite another stop throwing",
  () =>
    Effect.gen(function* () {
      const stopped = yield* Deferred.make<void>();
      let fail: ((reason: unknown) => void) | undefined;
      let change: ((filename: string) => void) | undefined;
      const released: string[] = [];
      const native = Layer.succeed(
        CliSourceWatch,
        CliSourceWatch.of({
          watch: (_path, _recursive, onChange, failure) =>
            Effect.sync(() => {
              fail = failure;
              change = onChange;
              return () => {
                released.push("watch");
                throw new Error("Native stop failed.");
              };
            }),
          poll: (path) =>
            Effect.succeed(() => {
              released.push(path.endsWith(".env.local") ? "env.local" : "env");
            }),
        }),
      );
      const forbidden = () => Effect.die(new Error("Unexpected candidate operation."));
      const sdk = Layer.succeed(
        CliDevSupervisor,
        CliDevSupervisor.of({
          start: forbidden,
          verify: forbidden,
          dispose: forbidden,
          drain: forbidden,
          listen: forbidden,
          stopProxy: () => Deferred.succeed(stopped, undefined).pipe(Effect.asVoid),
        }),
      );
      const graph = Layer.mergeAll(
        native,
        sdk,
        filesystemTestLayer(),
        cleanupLayer,
        Layer.succeed(CliPortProbe, CliPortProbe.of({ check: forbidden })),
      );
      const session = new DevSession({
        projectRoot: process.cwd(),
        compile: () => {
          throw new Error("Unexpected compile.");
        },
        logger: { human: false, json: false },
        installSignalHandlers: false,
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* makeDevSessionEngineEffect(session);
          const watcher = yield* makeDevSourceWatcherEffect(session);
          const reason = new Error("Native watcher failed.");
          fail?.(reason);
          for (let index = 0; index < 400; index += 1) change?.(`change-${index}.ts`);
          yield* Deferred.await(stopped);
          yield* engine.wait;
          watcher.close();
          yield* watcher.closeEffect;
          yield* watcher.closeEffect;
          expect(released).toEqual(["watch", "env", "env.local"]);
          const evidence = yield* CliCleanup.use((cleanup) => cleanup.snapshot());
          expect(evidence.map((issue) => issue.operation)).toEqual([
            "dev.watch.native",
            "dev.watch.registration.release",
          ]);
          expect(
            evidence[0]?.cause.reasons.some(
              (entry) => entry._tag === "Fail" && entry.error === reason,
            ),
          ).toBe(true);
          expect(session.isStopping).toBe(true);
        }),
      ).pipe(Effect.provide(graph));
    }),
  10_000,
);

it.live(
  "a fatal invalidation defect records its cause and requests session shutdown",
  () =>
    Effect.gen(function* () {
      const stopped = yield* Deferred.make<void>();
      let change: ((filename: string) => void) | undefined;
      const primary = new Error("Unexpected invalidation defect.");
      const native = Layer.succeed(
        CliSourceWatch,
        CliSourceWatch.of({
          watch: (_path, _recursive, onChange) =>
            Effect.sync(() => {
              change = onChange;
              return () => undefined;
            }),
          poll: () => Effect.succeed(() => undefined),
        }),
      );
      const forbidden = () => Effect.die(new Error("Unexpected candidate operation."));
      const sdk = Layer.succeed(
        CliDevSupervisor,
        CliDevSupervisor.of({
          start: forbidden,
          verify: forbidden,
          dispose: forbidden,
          drain: forbidden,
          listen: forbidden,
          stopProxy: () => Deferred.succeed(stopped, undefined).pipe(Effect.asVoid),
        }),
      );
      const graph = Layer.mergeAll(
        native,
        sdk,
        filesystemTestLayer(),
        cleanupLayer,
        Layer.succeed(CliPortProbe, CliPortProbe.of({ check: forbidden })),
      );
      const session = new DevSession({
        projectRoot: process.cwd(),
        compile: () => {
          throw new Error("Unexpected compile.");
        },
        sourceChangedEffect: () => Effect.die(primary),
        logger: { human: false, json: false },
        installSignalHandlers: false,
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* makeDevSessionEngineEffect(session);
          yield* makeDevSourceWatcherEffect(session);
          change?.("edited.ts");
          yield* Deferred.await(stopped);
          yield* engine.wait;
          const evidence = yield* CliCleanup.use((cleanup) => cleanup.snapshot());
          expect(evidence.map((issue) => issue.operation)).toEqual(["dev.watch.worker"]);
          expect(
            evidence[0]?.cause.reasons.some(
              (entry) => entry._tag === "Die" && entry.defect === primary,
            ),
          ).toBe(true);
          expect(session.isStopping).toBe(true);
        }),
      ).pipe(Effect.provide(graph));
    }),
  10_000,
);
