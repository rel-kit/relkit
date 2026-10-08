import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Logger, Ref } from "effect";
import { ContributorWorkspace } from "../../src/contributor-workspace.service.js";
import { workspaceFixture } from "./workspace.fixture.js";

it.effect("admits at most four independent manifest reads and joins all readers", () =>
  Effect.gen(function* () {
    const active = yield* Ref.make(0);
    const maximum = yield* Ref.make(0);
    const admitted = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const fixture = workspaceFixture(() =>
      Effect.acquireUseRelease(
        Ref.updateAndGet(active, (count) => count + 1).pipe(
          Effect.tap((count) => Ref.update(maximum, (value) => Math.max(value, count))),
          Effect.tap((count) =>
            count === 4 ? Deferred.succeed(admitted, undefined) : Effect.void,
          ),
        ),
        () => Deferred.await(release),
        () => Ref.update(active, (count) => count - 1),
      ).pipe(Effect.asVoid),
    );
    for (let index = 0; index < 10; index++)
      fixture.manifests.set("/repo/packages/extra" + index + "/package.json", {
        name: "@relkit/extra" + index,
      });
    const worker = yield* Effect.forkScoped(
      Effect.flatMap(ContributorWorkspace, (service) => service.roots("/repo")).pipe(
        Effect.provide(fixture.layer),
      ),
    );
    yield* Deferred.await(admitted);
    expect(yield* Ref.get(active)).toBe(4);
    yield* Deferred.succeed(release, undefined);
    expect((yield* Fiber.join(worker)).size).toBe(13);
    expect(yield* Ref.get(maximum)).toBe(4);
    expect(yield* Ref.get(active)).toBe(0);
  }).pipe(Effect.provide(Logger.layer([]))),
);
