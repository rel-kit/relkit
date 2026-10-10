/**
 * Proves the independent inventories overlap without granting partial authority.
 * Deterministic file-service barriers hold all four inventories; a serial
 * implementation cannot reach every barrier, and one completed branch cannot
 * settle validation while its sibling bytes remain unverified.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { DevSnapshots, devSnapshotsLive } from "../../src/dev-snapshot/snapshot.service.js";
import { tools, validationFixture } from "./validation-fixture.js";

it.effect("joins every concurrently verified inventory before returning authority", () =>
  Effect.gen(function* () {
    const entered = yield* Effect.forEach([0, 1, 2, 3], () => Deferred.make<void>());
    const captures = yield* Ref.make<readonly (readonly string[])[]>([]);
    const release = yield* Deferred.make<void>();
    const barrier = (index: number) => {
      const ready = entered[index];
      if (ready === undefined) return Effect.die(new Error("Missing inventory barrier"));
      return Deferred.succeed(ready, undefined).pipe(Effect.andThen(Deferred.await(release)));
    };
    const fixture = validationFixture("/project", (operations) => ({
      ...operations,
      projectPaths: (root) => barrier(0).pipe(Effect.andThen(operations.projectPaths(root))),
      mismatch: (root, members, limit) =>
        barrier(1).pipe(
          Effect.andThen(
            Ref.update(captures, (previous) => [...previous, members.map((member) => member.path)]),
          ),
          Effect.andThen(operations.mismatch(root, members, limit)),
        ),
      observations: (root, queries) =>
        barrier(3).pipe(Effect.andThen(operations.observations(root, queries))),
      read: (root, path, limit) =>
        (path.endsWith("/server.js") ? barrier(2) : Effect.void).pipe(
          Effect.andThen(operations.read(root, path, limit)),
        ),
    }));
    const validation = yield* DevSnapshots.use((service) =>
      service.validate(fixture.root, tools),
    ).pipe(Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))), Effect.forkChild);
    yield* Effect.forEach(entered, Deferred.await, { concurrency: 4 });
    expect(validation.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(release, undefined);
    const snapshot = yield* Fiber.join(validation);
    expect(snapshot.artifacts.length).toBe(fixture.receipt.artifacts.length);
    expect(Object.isFrozen(snapshot)).toBe(true);
    const batches = yield* Ref.get(captures);
    expect(batches).toEqual([["src/app.ts"]]);
  }),
);

it.effect("stages sealed artifacts while mutable verification remains joined to activation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const fixture = validationFixture("/project", (operations) => ({
        ...operations,
        mismatch: (root, members, limit) =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.andThen(operations.mismatch(root, members, limit)),
          ),
      }));
      const staged = yield* DevSnapshots.use((service) => service.stage(fixture.root, tools)).pipe(
        Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))),
      );
      yield* Deferred.await(entered);
      expect(staged.snapshot.artifacts.length).toBe(fixture.receipt.artifacts.length);
      const verification = yield* staged.verification.pipe(Effect.forkChild);
      expect(verification.pollUnsafe()).toBeUndefined();
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(verification);
    }),
  ),
);
