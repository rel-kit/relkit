/** Verifies bounded native watch failure supervision, invalidation defects and joined cleanup through precise SDK-shaped test adapters. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect } from "effect";
import { CliCleanup } from "../../src/services/cleanup.service.js";
import { makeDevSessionEngineEffect } from "../../src/commands/dev-session-engine.js";
import { makeDevSourceWatcherEffect } from "../../src/commands/dev-watch.js";
import { DevSession } from "../../src/commands/dev-session.js";
import { sourceWatchFixture } from "./source-watch-fixture.js";

it.live(
  "native watch failure is supervised and every stop joins despite another stop throwing",
  () =>
    Effect.gen(function* () {
      const fixture = yield* sourceWatchFixture(true);
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
          fixture.fail(reason);
          for (let index = 0; index < 400; index += 1) fixture.change("change-" + index + ".ts");
          yield* Deferred.await(fixture.stopped);
          yield* engine.wait;
          watcher.close();
          yield* watcher.closeEffect;
          yield* watcher.closeEffect;
          expect(fixture.released).toEqual(["watch", "env", "env.local"]);
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
      ).pipe(Effect.provide(fixture.graph));
    }),
  10_000,
);

it.live(
  "a fatal invalidation defect records its cause and requests session shutdown",
  () =>
    Effect.gen(function* () {
      const fixture = yield* sourceWatchFixture(false);
      const primary = new Error("Unexpected invalidation defect.");
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
          fixture.change("edited.ts");
          yield* Deferred.await(fixture.stopped);
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
      ).pipe(Effect.provide(fixture.graph));
    }),
  10_000,
);
