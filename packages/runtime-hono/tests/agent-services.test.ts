import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Layer, Scope, Exit } from "effect";
import { TestClock } from "effect/testing";
import { AgentRunTasks, AgentRunTasksLive } from "../src/agent-run-tasks.js";
import { agentRunSupervisionLayer } from "../src/agent-run-supervision.js";

it.effect("generation scope interrupts and joins accepted run finalizers", () =>
  Effect.gen(function* () {
    let finalized = false;
    const started = yield* Deferred.make<void>();
    yield* Effect.scoped(
      Effect.gen(function* () {
        const tasks = yield* AgentRunTasks;
        yield* tasks
          .start(
            "one",
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  finalized = true;
                }),
              ),
            ),
          )
          .pipe(Effect.forkScoped);
        yield* Deferred.await(started);
      }).pipe(Effect.provide(AgentRunTasksLive)),
    );
    expect(finalized).toBe(true);
  }),
);

it.effect("renews on schedule and joins the native controls consumer on close", () =>
  Effect.gen(function* () {
    let renewals = 0;
    let controlStopped = false;
    const ready = yield* Deferred.make<void>();
    const scope = yield* Scope.make();
    const layer = agentRunSupervisionLayer({
      renew: async () => {
        renewals++;
      },
      abort: () => undefined,
      controls: (signal) =>
        new Promise<void>((resolve) => {
          Effect.runSync(Deferred.succeed(ready, undefined));
          signal.addEventListener(
            "abort",
            () => {
              controlStopped = true;
              resolve();
            },
            { once: true },
          );
        }),
    });
    yield* Layer.buildWithScope(layer, scope);
    yield* Deferred.await(ready);
    expect(renewals).toBe(0);
    yield* TestClock.adjust(15_000);
    expect(renewals).toBe(1);
    yield* Scope.close(scope, Exit.void);
    expect(controlStopped).toBe(true);
    yield* TestClock.adjust(30_000);
    expect(renewals).toBe(1);
  }),
);
