/**
 * Verifies publication behavior with replaceable mutation/file Layers. These tests
 * prove copied integrity, pointer preservation, epoch fencing and scoped cleanup;
 * no child process or wall-clock timing is needed for these ownership contracts.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Ref } from "effect";
import { DevSnapshotRejected } from "../../src/dev-snapshot/snapshot-error.js";
import { SnapshotPublication } from "../../src/dev-snapshot/snapshot-publication.service.js";
import { publicationFixture } from "./publication-fixture.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";

it.effect(
  "publishes complete verified bytes and deduplicates concurrent identical generations",
  () => {
    const fixture = publicationFixture();
    const syntheticSecret = "synthetic-runtime-secret-never-persisted";
    fixture.bytes.set(`${fixture.root}/.env`, `RUNTIME_SECRET=${syntheticSecret}\n`);
    return Effect.gen(function* () {
      const publication = yield* SnapshotPublication;
      const generations = yield* Effect.forEach(
        [1, 2],
        () =>
          publication.publish(fixture.root, fixture.sourceDirectory, fixture.receipt, Effect.void),
        { concurrency: 2 },
      );
      expect(generations[0]).toBe(generations[1]);
      const capsule = `${fixture.root}/.relkit/dev/generations/${generations[0]!.slice(7)}`;
      const receipt = fixture.bytes.get(`${capsule}/receipt.json`)!;
      expect(snapshotDigest(receipt)).toBe(generations[0]);
      for (const member of fixture.receipt.artifacts)
        expect(snapshotDigest(fixture.bytes.get(`${capsule}/${member.path}`)!)).toBe(member.hash);
      const secretDigest = snapshotDigest(syntheticSecret);
      const published = [...fixture.bytes]
        .filter(([path]) => path.startsWith(capsule + "/"))
        .map(([, bytes]) => bytes)
        .join("\n");
      expect(published).not.toContain(syntheticSecret);
      expect(published).not.toContain(secretDigest);
      expect(published).not.toContain(`${fixture.root}/.relkit/dev/.prepare-`);
      expect(fixture.events.filter((event) => event.startsWith("acquired:"))).toHaveLength(2);
      expect(fixture.events.filter((event) => event.startsWith("released:"))).toHaveLength(2);
      expect([...fixture.bytes.keys()].some((path) => path.includes("/.prepare-"))).toBe(false);
    }).pipe(Effect.provide(fixture.layer));
  },
);

it.effect("source corruption fails before installing or replacing the current pointer", () => {
  const fixture = publicationFixture();
  const prior = fixture.bytes.get(`${fixture.root}/.relkit/dev/current.json`);
  fixture.bytes.set(`${fixture.sourceDirectory}/deferred.js`, "tampered");
  return Effect.gen(function* () {
    const publication = yield* SnapshotPublication;
    const result = yield* Effect.exit(
      publication.publish(fixture.root, fixture.sourceDirectory, fixture.receipt, Effect.void),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(fixture.bytes.get(`${fixture.root}/.relkit/dev/current.json`)).toBe(prior);
    expect(fixture.events).not.toContain("installed");
    expect(fixture.events).not.toContain("pointed");
  }).pipe(Effect.provide(fixture.layer));
});

it.effect("an obsolete epoch after installation retains the previous complete snapshot", () => {
  const fixture = publicationFixture();
  const prior = fixture.bytes.get(`${fixture.root}/.relkit/dev/current.json`);
  return Effect.gen(function* () {
    const calls = yield* Ref.make(0);
    const current = Ref.updateAndGet(calls, (count) => count + 1).pipe(
      Effect.flatMap((count) =>
        count < 3
          ? Effect.void
          : Effect.fail(new DevSnapshotRejected({ reason: "stale", operation: "test.epoch" })),
      ),
    );
    const publication = yield* SnapshotPublication;
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          publication.publish(fixture.root, fixture.sourceDirectory, fixture.receipt, current),
        ),
      ),
    ).toBe(true);
    expect(fixture.events).toContain("installed");
    expect(fixture.events).not.toContain("pointed");
    expect(fixture.bytes.get(`${fixture.root}/.relkit/dev/current.json`)).toBe(prior);
  }).pipe(Effect.provide(fixture.layer));
});

it.effect("cancellation joins owned stage cleanup before the publication fiber exits", () => {
  const fixture = publicationFixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const barrier = yield* Deferred.make<void>();
      const current = Ref.updateAndGet(calls, (count) => count + 1).pipe(
        Effect.flatMap((count) =>
          count === 2
            ? Deferred.succeed(barrier, undefined).pipe(Effect.andThen(Effect.never))
            : Effect.void,
        ),
      );
      const publication = yield* SnapshotPublication;
      const fiber = yield* publication
        .publish(fixture.root, fixture.sourceDirectory, fixture.receipt, current)
        .pipe(Effect.forkScoped);
      yield* Deferred.await(barrier);
      yield* Fiber.interrupt(fiber);
      expect(fixture.events.filter((event) => event.startsWith("released:"))).toHaveLength(1);
      expect(fixture.events).not.toContain("pointed");
      expect([...fixture.bytes.keys()].some((path) => path.includes("/.prepare-"))).toBe(false);
    }),
  ).pipe(Effect.provide(fixture.layer));
});
